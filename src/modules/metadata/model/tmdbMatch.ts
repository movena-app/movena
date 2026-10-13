/**
 * Decides whether a TMDB search result is the title a provider lists.
 *
 * TMDB's first result is only its best guess for the query text. Taking it as
 * the match pins another film's rating on the title: a namesake from another
 * decade, or an obscure entry that averages 10.0 on a single vote.
 */

export interface TmdbTitleQuery {
  /** Display title with provider prefixes, tags and the year already removed. */
  title: string;
  year?: number | null | undefined;
}

interface TmdbMatchCandidate {
  title: string;
  originalTitle?: string | null | undefined;
  releaseYear?: number | null | undefined;
}

/** Releases and first air dates drift by a year between territories and databases. */
const YEAR_TOLERANCE = 1;

/** Letters and digits only, so case, accents and punctuation do not decide a match. */
export function tmdbTitleKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * 2 for the same title, 1 for a near-identical spelling ("City of Bloods" for
 * "City of Blood"), 0 otherwise. A near match must share all but a fifth of
 * its letters, so "Avatar" never matches "Avatar: The Way of Water".
 */
function titleSimilarity(wanted: string, candidate: TmdbMatchCandidate): number {
  const keys = [candidate.title, candidate.originalTitle ?? '']
    .map(tmdbTitleKey)
    .filter((key) => key.length > 0);
  if (keys.includes(wanted)) return 2;
  for (const key of keys) {
    const [shorter, longer] = key.length <= wanted.length ? [key, wanted] : [wanted, key];
    if (shorter.length >= 4 && longer.includes(shorter) && shorter.length / longer.length >= 0.8)
      return 1;
  }
  return 0;
}

/**
 * The candidate that is this title, or undefined when none is. With a known
 * year, a candidate from another year is a different film or series of the
 * same name and never matches. Ties keep TMDB's own order.
 */
export function selectTmdbMatch<T extends TmdbMatchCandidate>(
  query: TmdbTitleQuery,
  candidates: readonly T[],
): T | undefined {
  const wanted = tmdbTitleKey(query.title);
  if (!wanted) return undefined;
  let best: { candidate: T; score: number } | undefined;
  for (const candidate of candidates) {
    const similarity = titleSimilarity(wanted, candidate);
    if (!similarity) continue;
    let score = similarity * 10;
    if (query.year && candidate.releaseYear) {
      const distance = Math.abs(candidate.releaseYear - query.year);
      if (distance > YEAR_TOLERANCE) continue;
      score += distance === 0 ? 3 : 1;
    }
    if (!best || score > best.score) best = { candidate, score };
  }
  return best?.candidate;
}
