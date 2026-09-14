import type { MediaItem } from '@/modules/catalog/public/model/media';

/**
 * Normalizes diacritics, accents, and converts to lowercase.
 * e.g., "Café" -> "cafe", "München" -> "munchen", "Pokémon" -> "pokemon"
 */
export const normalizeText = (text: string): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

/**
 * Extracts clean alphanumeric word tokens from a string.
 */
export const getTokens = (text: string): string[] => {
  const normalized = normalizeText(text);
  return normalized
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
};

/**
 * Removes non-alphanumeric characters for compact string comparison.
 * e.g. "Spider-Man: No Way Home" -> "spidermanowayhome"
 */
export const toCompact = (text: string): string => {
  return normalizeText(text).replace(/[^a-z0-9]/g, '');
};

interface PreparedSearchText {
  normalized: string;
  compact: string;
  tokens: string[];
}

interface CachedItemSearchText extends PreparedSearchText {
  title: string;
}

const itemSearchTextCache = new WeakMap<MediaItem, CachedItemSearchText>();

function prepareNormalizedText(normalized: string): PreparedSearchText {
  return {
    normalized,
    compact: normalized.replace(/[^a-z0-9]/g, ''),
    tokens: normalized
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  };
}

function prepareQuery(rawQuery: string): PreparedSearchText | null {
  const normalized = normalizeText(rawQuery).trim();
  if (!normalized) return null;

  const prepared = prepareNormalizedText(normalized);
  return prepared.tokens.length > 0 || prepared.compact ? prepared : null;
}

function prepareItem(item: MediaItem): CachedItemSearchText {
  const cached = itemSearchTextCache.get(item);
  if (cached?.title === item.title) return cached;

  const prepared = {
    title: item.title,
    ...prepareNormalizedText(normalizeText(item.title)),
  };
  itemSearchTextCache.set(item, prepared);
  return prepared;
}

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const lenA = a.length;
  const lenB = b.length;

  let row0 = new Int32Array(lenA + 1);
  let row1 = new Int32Array(lenA + 1);

  for (let j = 0; j <= lenA; j++) {
    row0[j] = j;
  }

  for (let i = 0; i < lenB; i++) {
    row1[0] = i + 1;

    for (let j = 0; j < lenA; j++) {
      const cost = a.charCodeAt(j) === b.charCodeAt(i) ? 0 : 1;
      row1[j + 1] = Math.min(row0[j + 1]! + 1, row1[j]! + 1, row0[j]! + cost);
    }

    const tmp = row0;
    row0 = row1;
    row1 = tmp;
  }

  return row0[lenA] ?? lenB;
};

/**
 * Calculates relevance score for a single item against a search query.
 */
function calculatePreparedMatchScore(
  item: MediaItem,
  query: PreparedSearchText,
  title: CachedItemSearchText,
): number {
  const queryNorm = query.normalized;
  const queryCompact = query.compact;
  const queryTokens = query.tokens;
  const titleNorm = title.normalized;
  const titleCompact = title.compact;
  const titleTokens = title.tokens;

  let score = 0;

  // 1. Exact & Compact Matches
  if (titleNorm === queryNorm) {
    score += 1000;
  } else if (titleCompact === queryCompact) {
    score += 850;
  } else if (titleNorm.startsWith(queryNorm)) {
    score += 600;
  } else if (titleCompact.startsWith(queryCompact) && queryCompact.length >= 2) {
    score += 500;
  } else if (titleNorm.includes(queryNorm)) {
    score += 400;
  } else if (titleCompact.includes(queryCompact) && queryCompact.length >= 3) {
    score += 350;
  }

  // 2. Token Matching Logic
  let matchedTokensCount = 0;
  let totalTokenMatchScore = 0;

  for (const qToken of queryTokens) {
    let bestTokenScore = 0;

    for (const tToken of titleTokens) {
      if (tToken === qToken) {
        bestTokenScore = Math.max(bestTokenScore, 100);
      } else if (tToken.startsWith(qToken)) {
        bestTokenScore = Math.max(bestTokenScore, 75);
      } else if (tToken.includes(qToken)) {
        bestTokenScore = Math.max(bestTokenScore, 50);
      } else if (
        qToken.length >= 3 &&
        tToken.length >= 3 &&
        qToken[0] === tToken[0] &&
        Math.abs(qToken.length - tToken.length) <= 2
      ) {
        // Typo tolerance matching via edit distance
        const dist = levenshteinDistance(qToken, tToken);
        const maxAllowedDist = qToken.length <= 5 ? 1 : 2;
        if (dist <= maxAllowedDist) {
          bestTokenScore = Math.max(bestTokenScore, 35 - dist * 5);
        }
      }
    }

    if (bestTokenScore > 0) {
      matchedTokensCount++;
      totalTokenMatchScore += bestTokenScore;
    }
  }

  score += totalTokenMatchScore;

  // Bonus if all query tokens matched
  if (queryTokens.length > 0 && matchedTokensCount === queryTokens.length) {
    score += 250;
  } else if (matchedTokensCount > 0) {
    // Partial token ratio bonus
    score += Math.round((matchedTokensCount / queryTokens.length) * 100);
  }

  // 3. Secondary Metadata Fields (Year, Quality, Type)
  if (item.year && queryNorm.includes(item.year.toLowerCase())) {
    score += 150;
  }
  if (item.quality && queryNorm.includes(item.quality.toLowerCase())) {
    score += 60;
  }
  if (item.type && queryNorm.includes(item.type.toLowerCase())) {
    score += 40;
  }

  return score;
}

export const calculateMatchScore = (item: MediaItem, rawQuery: string): number => {
  const query = prepareQuery(rawQuery);
  return query ? calculatePreparedMatchScore(item, query, prepareItem(item)) : 0;
};

/**
 * Smart search function to filter and rank MediaItems by relevance score.
 */
export const smartSearch = <T extends MediaItem>(items: T[], rawQuery: string): T[] => {
  const query = prepareQuery(rawQuery);
  if (!query) return [];

  const scoredItems: { item: T; score: number }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const score = calculatePreparedMatchScore(item, query, prepareItem(item));
    if (score > 0) {
      scoredItems.push({ item, score });
    }
  }

  // Sort by score descending, preserving order for equal scores
  scoredItems.sort((a, b) => b.score - a.score);

  return scoredItems.map((si) => si.item);
};
