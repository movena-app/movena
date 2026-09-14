import { COUNTRY_ALIASES, COUNTRY_NAMES, normalizeCountryCode } from '@/shared/lib/categoryName';
import { extractMediaTags, mergeMediaTags } from '@/shared/lib/mediaTags';
import { normalizeFancyUnicode } from '@/shared/lib/textNormalization';

export interface ParsedChannelTitle {
  cleanTitle: string;
  qualityBadges: string[];
  categoryPrefix?: string | undefined;
  country: string | null;
}

export interface ParsedMediaTitle {
  cleanTitle: string;
  country: string | null;
  tags: string[];
}

export interface ParsedMediaDisplayTitle extends ParsedMediaTitle {
  releaseYear: string | null;
}

export interface ParsedEpisodeTitle extends ParsedMediaTitle {
  seriesTitle: string | null;
  seasonNum: string | null;
  episodeNum: string | null;
}

export interface EpisodeTitleContext {
  seriesTitle?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
}

export interface CustomTitleRule {
  id: string;
  pattern: string;
  isRegex?: boolean | undefined;
  enabled?: boolean | undefined;
}

const compiledRuleCache = new WeakMap<readonly CustomTitleRule[], RegExp[]>();

function compiledCustomTitleRules(rules: readonly CustomTitleRule[]): RegExp[] {
  const cached = compiledRuleCache.get(rules);
  if (cached) return cached;

  const compiled: RegExp[] = [];
  for (const rule of rules) {
    if (rule.enabled === false || !rule.pattern?.trim()) continue;
    try {
      const source = rule.isRegex
        ? rule.pattern.trim()
        : `\\b${rule.pattern.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
      compiled.push(new RegExp(source, 'gi'));
    } catch {
      // Invalid regex is safely ignored.
    }
  }
  compiledRuleCache.set(rules, compiled);
  return compiled;
}

const KNOWN_COUNTRY_CODES = new Set([
  ...Object.keys(COUNTRY_NAMES),
  ...Object.keys(COUNTRY_ALIASES),
]);

const KNOWN_CLUSTER_MARKERS = new Set([
  'DO', // Dolby / Dolby Digital audio in German/IPTV playlists (e.g. DE-DO)
  'DD',
  'AC3',
  'EAC3',
  'DTS',
  'AAC',
  'ATMOS',
  'TRUEHD',
  'STEREO',
  'MULTI',
  'DUAL',
  'TRIAUDIO',
  'MULTISUBS',
  'DOKU',
  'DOCU',
  'DOCUMENTARY',
  'KINO',
  'CINEMA',
  'MOVIES',
  'FILME',
  'SERIES',
  'SERIEN',
  'SHOWS',
  'KIDS',
  'ANIME',
  'OV',
  'OMU',
  'OMEU',
  'VO',
  'VF',
  'VA',
  'VFB',
  'VOSTFR',
  'SUB',
  'SUBS',
  'SUBBED',
  'DUB',
  'DUBBED',
  'HQ',
  'RAW',
  'VIP',
  'PPV',
  'VOD',
  'WEBDL',
  'WEB',
  'WEBRIP',
  'BLURAY',
  'BDRIP',
  'BRRIP',
  'HDTV',
  'DVDRIP',
  'CAM',
  'TS',
  'TELESYNC',
  'REMASTERED',
  'EXTENDED',
  'UNRATED',
  'DIRECTORSCUT',
  'PROPER',
  'REPACK',
]);

const DECORATION = /^[\s#*=_~\/\-–—·|:]+|[\s#*=_~\/\-–—·|:]+$/g;
const AD_FLUFF_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\[(?:t\.me|telegram|discord|bit\.ly|t\.co)[^\]]*\]|\((?:t\.me|telegram|discord|bit\.ly|t\.co)[^)]*\)|\b(?:t\.me|telegram\.me)\/\S+/gi;
const BACKUP_SERVER_PATTERN =
  /\b(?:SERVER\s*\d+|FEED\s*\d+|BACKUP|ALT\s*\d*|VIP\+|MAIN|DIRECT)\b/gi;
const PROMOTIONAL_TIER_PATTERN = /\b(?:GOLD|SILVER|PLATINUM|VIP|PREMIUM|ULTRA|PRO)\b/gi;

function cleanSeparators(value: string): string {
  if (!value) return '';
  const normalized = normalizeFancyUnicode(value);
  return normalized
    .replace(DECORATION, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .trim();
}

export function stripAdFluff(value: string): string {
  if (!value) return '';
  const normalized = normalizeFancyUnicode(value);
  return normalized
    .replace(AD_FLUFF_PATTERN, ' ')
    .replace(BACKUP_SERVER_PATTERN, ' ')
    .replace(PROMOTIONAL_TIER_PATTERN, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Cleans human-facing provider copy without treating it like a media title.
 * Hash-wrapped station promos are common in EPG descriptions and should not
 * leak into the guide, while ordinary punctuation inside the description is
 * preserved.
 */
export function cleanProviderDescription(value: string): string {
  if (!value) return '';
  const normalized = normalizeFancyUnicode(value);
  return cleanSeparators(
    stripAdFluff(normalized)
      .replace(/\s+\b(?:on|auf|sur|en)\s+#{2,}[^#\r\n]{1,160}#{2,}/gi, ' ')
      .replace(/#{2,}[^#\r\n]{1,160}#{2,}/g, ' ')
      .replace(/#{2,}\s*/g, ' ')
      .replace(/\s{2,}/g, ' '),
  );
}

export function applyCustomTitleRules(
  rawTitle: string,
  rules?: readonly CustomTitleRule[],
): string {
  if (!rules || rules.length === 0) return rawTitle;
  let result = rawTitle;

  for (const regex of compiledCustomTitleRules(rules)) {
    regex.lastIndex = 0;
    result = result.replace(regex, ' ');
  }

  return cleanSeparators(result);
}

function parseMarkerCluster(value: string): {
  recognized: boolean;
  country: string | null;
  tags: string[];
} {
  const extracted = extractMediaTags(value);
  const remaining = extracted.cleanText
    .replace(/[()[\]{}]/g, ' ')
    .split(/[\s|/:,-]+/)
    .filter(Boolean);
  let country: string | null = null;

  if (remaining.length === 0) {
    const isRecognized = extracted.tags.length > 0 || extracted.cleanText !== value;
    return {
      recognized: isRecognized,
      country: null,
      tags: extracted.tags,
    };
  }

  for (const token of remaining) {
    const upper = token.toUpperCase();
    if (KNOWN_COUNTRY_CODES.has(upper)) {
      if (!country) {
        country = normalizeCountryCode(upper);
      }
      continue;
    }
    if (KNOWN_CLUSTER_MARKERS.has(upper)) {
      continue;
    }
    return { recognized: false, country: null, tags: [] };
  }

  return {
    recognized: true,
    country,
    tags: extracted.tags,
  };
}

/**
 * Removes provider marker clusters such as `4K-DE-DV -` only when every token
 * is a known country or technical marker. Ordinary titles containing dashes
 * are therefore left intact.
 */
export function parseMediaTitle(
  rawTitle: string,
  customRules?: readonly CustomTitleRule[],
): ParsedMediaTitle {
  if (!rawTitle) return { cleanTitle: '', country: null, tags: [] };

  let title = applyCustomTitleRules(stripAdFluff(rawTitle), customRules);
  title = cleanSeparators(title.trim());

  // If title is a dot-delimited scene release (e.g. Movie.Name.2023.1080p.WEBRip), convert dots to spaces
  if (title.split('.').length >= 3 && !title.includes(' ')) {
    title = title.replace(/\./g, ' ');
  }

  let country: string | null = null;
  let tags: string[] = [];

  const bracketPrefix = title.match(/^[([]([^()[\]]{1,40})[)\]]\s*[-–—|:]?\s*(.+)$/);
  if (bracketPrefix) {
    const parsed = parseMarkerCluster(bracketPrefix[1]!);
    if (parsed.recognized) {
      title = bracketPrefix[2]!;
      country = country ?? parsed.country;
      tags = mergeMediaTags(...tags, ...parsed.tags);
    }
  }

  const prefix = title.match(/^(.{1,60}?)\s+-\s+(.+)$/);
  if (prefix) {
    const parsed = parseMarkerCluster(prefix[1]!);
    if (parsed.recognized) {
      title = prefix[2]!;
      country = country ?? parsed.country;
      tags = mergeMediaTags(...tags, ...parsed.tags);
    }
  }

  if (!country && tags.length === 0) {
    const pipePrefix = title.match(/^([^|:]{1,40})\s*[|:]\s*(.+)$/);
    if (pipePrefix) {
      const parsed = parseMarkerCluster(pipePrefix[1]!);
      if (parsed.recognized) {
        title = pipePrefix[2]!;
        country = parsed.country;
        tags = parsed.tags;
      }
    }
  }

  const suffix = title.match(/^(.+?)\s+(?:-|\|)\s+(.{1,50})$/);
  if (suffix) {
    const parsed = parseMarkerCluster(suffix[2]!);
    if (parsed.recognized) {
      title = suffix[1]!;
      country = country ?? parsed.country;
      tags = mergeMediaTags(...tags, ...parsed.tags);
    }
  }

  // Providers also append territory/format markers in parentheses or brackets,
  // for example `MobLand (2025) (GB)` or `Movie [4K] [UHD]`.
  let parenthesizedSuffix = title.match(/^(.+?)\s+[([]([^()[\]]{1,30})[)\]]$/);
  while (parenthesizedSuffix) {
    const parsed = parseMarkerCluster(parenthesizedSuffix[2]!);
    if (!parsed.recognized) break;
    title = parenthesizedSuffix[1]!;
    country = country ?? parsed.country;
    tags = mergeMediaTags(...tags, ...parsed.tags);
    parenthesizedSuffix = title.match(/^(.+?)\s+[([]([^()[\]]{1,30})[)\]]$/);
  }

  // Also extract standalone media tags/editions from the title body if present
  const extractedBody = extractMediaTags(title);
  if (extractedBody.tags.length > 0) {
    tags = mergeMediaTags(...tags, ...extractedBody.tags);
    title = extractedBody.cleanText;
  }

  return { cleanTitle: cleanSeparators(title) || rawTitle.trim(), country, tags };
}

/**
 * Card-friendly media title parts. Provider markers are normalized by the
 * canonical parser first; release years in parentheses, brackets, or trailing words
 * are separated so compact UI can give it its own visual priority.
 */
export function parseMediaDisplayTitle(
  rawTitle: string,
  explicitYear?: string,
  customRules?: readonly CustomTitleRule[],
): ParsedMediaDisplayTitle {
  const parsed = parseMediaTitle(rawTitle, customRules);
  const normalizedExplicitYear = explicitYear?.trim().match(/^(?:18|19|20)\d{2}$/)?.[0] ?? null;

  if (normalizedExplicitYear) {
    const trailingDuplicate = parsed.cleanTitle.match(/^(.+?)\s+[([]?(?:18|19|20)\d{2}[)\]]?$/);
    return {
      ...parsed,
      cleanTitle: trailingDuplicate ? cleanSeparators(trailingDuplicate[1]!) : parsed.cleanTitle,
      releaseYear: normalizedExplicitYear,
    };
  }

  // Check for year in parentheses or brackets: `(2024)` or `[2024]` at the end
  const bracketYearMatch = parsed.cleanTitle.match(/^(.+?)\s+[([]((?:18|19|20)\d{2})[)\]]$/);
  if (bracketYearMatch) {
    return {
      ...parsed,
      cleanTitle: cleanSeparators(bracketYearMatch[1]!),
      releaseYear: bracketYearMatch[2]!,
    };
  }

  // Check for trailing 4-digit year e.g. `Movie Title 2024`
  const trailingYearMatch = parsed.cleanTitle.match(/^(.+?)\s+((?:18|19|20)\d{2})$/);
  if (trailingYearMatch) {
    return {
      ...parsed,
      cleanTitle: cleanSeparators(trailingYearMatch[1]!),
      releaseYear: trailingYearMatch[2]!,
    };
  }

  // Check for inline bracketed year e.g. `Movie Title (2024) Part 2`
  const inlineYearMatch = parsed.cleanTitle.match(/^(.+?)\s+[([]((?:18|19|20)\d{2})[)\]]\s+(.+)$/);
  if (inlineYearMatch) {
    return {
      ...parsed,
      cleanTitle: cleanSeparators(`${inlineYearMatch[1]!} ${inlineYearMatch[3]!}`),
      releaseYear: inlineYearMatch[2]!,
    };
  }

  return {
    ...parsed,
    releaseYear: null,
  };
}

function normalizeEpisodeIndex(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? String(numeric) : String(value).trim();
}

/**
 * Turns filename-style provider episode names into structured UI data.
 *
 * Example:
 * `4K-DE-DV - MobLand (2025) (GB) - S01E01 - Stick or Twist`
 * becomes series `MobLand (2025)` and episode `Stick or Twist`.
 */
export function parseEpisodeTitle(
  rawTitle: string | undefined,
  context: EpisodeTitleContext = {},
  customRules?: readonly CustomTitleRule[],
): ParsedEpisodeTitle {
  const parsed = parseMediaTitle(rawTitle || '', customRules);
  let workingTitle = parsed.cleanTitle;
  let seriesTitle = context.seriesTitle
    ? parseMediaTitle(context.seriesTitle, customRules).cleanTitle
    : null;
  let seasonNum = normalizeEpisodeIndex(context.seasonNum);
  let episodeNum = normalizeEpisodeIndex(context.episodeNum);
  let country = parsed.country;
  let tags = parsed.tags;

  const episodeCode = workingTitle.match(
    /\bS(?:EASON\s*)?0*(\d{1,3})\s*[:.-]?\s*E(?:PISODE\s*)?0*(\d{1,4})\b/i,
  );
  if (episodeCode && episodeCode.index !== undefined) {
    const beforeCode = cleanSeparators(workingTitle.slice(0, episodeCode.index));
    const afterCode = cleanSeparators(
      workingTitle.slice(episodeCode.index + episodeCode[0].length),
    );
    const parsedSeries = beforeCode ? parseMediaTitle(beforeCode, customRules) : null;
    const containsNestedEpisode =
      /\bS(?:EASON\s*)?0*\d{1,3}\s*[:.-]?\s*E(?:PISODE\s*)?0*\d{1,4}\b/i.test(afterCode);
    const nestedEpisode = containsNestedEpisode
      ? parseEpisodeTitle(afterCode, context, customRules)
      : null;

    seriesTitle = parsedSeries?.cleanTitle || seriesTitle;
    seasonNum = normalizeEpisodeIndex(episodeCode[1]) ?? seasonNum;
    episodeNum = normalizeEpisodeIndex(episodeCode[2]) ?? episodeNum;
    country = country ?? nestedEpisode?.country ?? parsedSeries?.country ?? null;
    tags = mergeMediaTags(...tags, ...(nestedEpisode?.tags ?? []), ...(parsedSeries?.tags ?? []));
    workingTitle = nestedEpisode?.cleanTitle || afterCode;
  } else {
    // A few APIs return `E01 - Title` instead of a full SxxExx code.
    const shortCode = workingTitle.match(/^(?:EPISODE|E)\s*0*(\d{1,4})\s*(?:[-–—:|.]\s*)?(.*)$/i);
    if (shortCode) {
      episodeNum = normalizeEpisodeIndex(shortCode[1]) ?? episodeNum;
      workingTitle = cleanSeparators(shortCode[2]!);
    }

    // If the provider repeated the known series name without an episode code,
    // remove only an exact separator-delimited prefix.
    if (seriesTitle && workingTitle) {
      const escapedSeries = seriesTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      workingTitle = cleanSeparators(
        workingTitle.replace(new RegExp(`^${escapedSeries}\\s*[-–—:|]\\s*`, 'i'), ''),
      );
    }
  }

  const fallbackEpisode = episodeNum ? `Episode ${episodeNum}` : 'Episode';
  return {
    cleanTitle: workingTitle || fallbackEpisode,
    seriesTitle,
    seasonNum,
    episodeNum,
    country,
    tags,
  };
}

/** Canonical player/history title assembled from structured episode data. */
export function formatEpisodePlaybackTitle(
  seriesTitle: string,
  seasonNum: string | number | undefined,
  episodeNum: string | number | undefined,
  rawEpisodeTitle?: string,
): string {
  const cleanSeriesTitle = parseMediaTitle(seriesTitle).cleanTitle || 'Series';
  const parsedEpisode = parseEpisodeTitle(rawEpisodeTitle, {
    seriesTitle: cleanSeriesTitle,
    seasonNum,
    episodeNum,
  });
  const episodeIdentity =
    parsedEpisode.seasonNum && parsedEpisode.episodeNum
      ? `S${parsedEpisode.seasonNum}:E${parsedEpisode.episodeNum}`
      : parsedEpisode.episodeNum
        ? `E${parsedEpisode.episodeNum}`
        : null;

  return [cleanSeriesTitle, episodeIdentity, parsedEpisode.cleanTitle].filter(Boolean).join(' · ');
}

/** Live names additionally remove standalone technical markers in the channel name. */
export function parseLiveChannelTitle(
  rawTitle: string,
  customRules?: readonly CustomTitleRule[],
): ParsedChannelTitle {
  if (!rawTitle) return { cleanTitle: '', qualityBadges: [], country: null };

  let title = applyCustomTitleRules(stripAdFluff(rawTitle), customRules);
  title = cleanSeparators(title.trim());
  let categoryPrefix: string | undefined;
  let prefixCountry: string | null = null;

  const pipePrefix = title.match(/^([A-Z]{2,12})\s*[|:]\s*(.+)$/i);
  if (pipePrefix) {
    categoryPrefix = pipePrefix[1]!.toUpperCase();
    if (KNOWN_COUNTRY_CODES.has(categoryPrefix)) {
      prefixCountry = normalizeCountryCode(categoryPrefix);
    }
    title = pipePrefix[2]!;
  }

  const parsed = parseMediaTitle(title, customRules);
  const extracted = extractMediaTags(parsed.cleanTitle);
  let cleanTitle = cleanSeparators(extracted.cleanText) || parsed.cleanTitle;
  let country = prefixCountry ?? parsed.country;

  const trailingCountry = cleanTitle.match(/^(.+?)\s+([A-Z]{2})$/);
  if (trailingCountry && KNOWN_COUNTRY_CODES.has(trailingCountry[2]!.toUpperCase())) {
    cleanTitle = cleanSeparators(trailingCountry[1]!);
    country = country ?? normalizeCountryCode(trailingCountry[2]!.toUpperCase());
  }

  cleanTitle = cleanTitle
    .replace(
      /\b(?:INF\s*(?:&|\+)\s*(?:EVENTS|CHANNELS)?|INF\s*&|GOLD|SILVER|PLATINUM|VIP|PREMIUM)\b/gi,
      '',
    )
    .replace(/\s*[/|\-:]\s*[/|\-:]+/g, ' /')
    .replace(/\s+/g, ' ')
    .trim();
  cleanTitle = cleanSeparators(cleanTitle) || parsed.cleanTitle;

  return {
    cleanTitle,
    qualityBadges: mergeMediaTags(...parsed.tags, ...extracted.tags),
    categoryPrefix: categoryPrefix ?? country ?? undefined,
    country,
  };
}

export function getDisplayTitle(
  rawTitle: string,
  type?: 'live' | 'vod' | 'series',
  customRules?: readonly CustomTitleRule[],
): string {
  return type === 'live'
    ? parseLiveChannelTitle(rawTitle, customRules).cleanTitle
    : parseMediaTitle(rawTitle, customRules).cleanTitle;
}

export function getSeriesBaseTitle(rawTitle: string): string {
  const parsedEpisode = parseEpisodeTitle(rawTitle);
  if (parsedEpisode.seriesTitle) return parsedEpisode.seriesTitle;

  return parseMediaTitle(rawTitle)
    .cleanTitle.replace(/\s+(?:-|·)\s+S\d+[: ]?E\d+(?:\s+(?:-|·)\s+.*)?$/i, '')
    .trim();
}
