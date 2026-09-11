import { normalizeFancyUnicode } from '@/shared/lib/textNormalization';

export type TagColorType = 'gold' | 'cyan' | 'purple' | 'blue' | 'green' | 'coral' | 'silver';
export type TagCategory = 'resolution' | 'fps' | 'audio' | 'edition' | 'format';

const TAG_PATTERN_SOURCE = [
  '(?:GOLD|SILVER|PLATINUM|VIP|PREMIUM|PRO|ULTRA)\\s+RAW',
  'RAW\\s+(?:GOLD|SILVER|PLATINUM|VIP|PREMIUM|PRO|ULTRA)',
  "DIRECTOR['’]?S?\\s+CUT",
  'EXTENDED(?:\\s+CUT|\\s+EDITION)?',
  'THEATRICAL(?:\\s+CUT)?',
  'SPECIAL\\s+EDITION',
  'IMAX\\s+ENHANCED',
  'IMAX',
  'REMASTERED',
  'UNRATED',
  'CRITERION(?:\\s+COLLECTION)?',
  'FINAL\\s+CUT',
  'ULTIMATE(?:\\s+EDITION)?',
  'DOLBY[\\s_-]*VISION',
  'DOLBY[\\s_-]*ATMOS',
  'DOLBY[\\s_-]*TRUEHD',
  'TRUEHD',
  'HDR10(?:\\s*PLUS|\\+)',
  'HDR10',
  'HDR',
  'HLG',
  'DTS(?::X|-X)',
  'DTS[\\s_-]*HD(?:\\s*MA|\\s*HRA)?',
  'DTS',
  'E[.-]?AC-?3',
  'DOLBY\\s+(?:AUDIO|DIGITAL)',
  'MULTI[\\s_-]*AUDIO',
  'DUAL[\\s_-]*AUDIO',
  'MULTI[\\s_-]*SUBS?',
  'OMEU',
  'OMU',
  'OV',
  'VOSTFR',
  'DUBBED',
  'SUBBED',
  '24\\s*[/\\\\]\\s*7',
  '4320P',
  '3840P',
  '2160P',
  '1080P',
  '720P',
  '480P',
  '60\\s*FPS',
  '50\\s*FPS',
  'BLU[\\s_-]*RAY',
  'BDRIP',
  'BRRIP',
  'WEB[\\s_-]*DL',
  'WEBDL',
  'WEBRIP',
  'WEB',
  'HDTV',
  'DVDRIP',
  'DVD',
  'REMUX',
  '10[\\s_-]*BIT',
  'H\\.?26[45]',
  'X26[45]',
  'DD\\+',
  '7\\.1',
  '5\\.1',
  'DOVI',
  'DV',
  '8K',
  '4K',
  'UHD',
  'FHD',
  'HD',
  'SD',
  'ATMOS',
  'DOLBY',
  'HEVC',
  'AV1',
  'AVC',
  'AC3',
  'AAC',
  'RAW',
  'VIP',
  'PPV',
  '3D',
  'GOLD',
  'SILVER',
  'PLATINUM',
  'PREMIUM',
  'ULTRA',
  'PRO',
  'VOD',
  'IPTV',
  'EPG',
].join('|');

/** Standalone provider marker, protected from matching inside ordinary words. */
const TAG_PATTERN = new RegExp(`(?<![A-Z0-9])(${TAG_PATTERN_SOURCE})(?![A-Z0-9])`, 'gi');

const NON_DISPLAY_MARKERS = new Set([
  'VOD',
  'IPTV',
  'EPG',
  'GOLD',
  'SILVER',
  'PLATINUM',
  'VIP',
  'PREMIUM',
  'ULTRA',
  'PRO',
]);

const TAG_PRIORITY = [
  '8K',
  '4K',
  'FHD',
  'HD',
  'SD',
  'DV',
  'HDR10+',
  'HDR10',
  'HDR',
  'HLG',
  '10-Bit',
  'ATMOS',
  'DOLBY',
  'TrueHD',
  'DTS:X',
  'DTS-HD',
  'DTS',
  'DD+',
  '7.1',
  '5.1',
  'AC3',
  'AAC',
  'Multi-Audio',
  'Multi-Sub',
  'OmU',
  'OmeU',
  'OV',
  'VOSTFR',
  'Dubbed',
  'Subbed',
  "Director's Cut",
  'Extended Cut',
  'IMAX',
  'Theatrical',
  'Special Edition',
  'Remastered',
  'Final Cut',
  'Ultimate Edition',
  'Unrated',
  'Criterion',
  'BluRay',
  'WEB-DL',
  'WEBRip',
  'Remux',
  'HDTV',
  'DVD',
  'HEVC',
  'AV1',
  'AVC',
  '60FPS',
  '50FPS',
  '3D',
  '24/7',
  'RAW',
  'PPV',
];

export function normalizeMediaTag(value: string): string | null {
  const normalizedValue = normalizeFancyUnicode(value);
  const compact = normalizedValue
    .trim()
    .toUpperCase()
    .replace(/[\s_.-]+/g, '');

  if (/^(24\/?7|247)$/.test(compact)) return '24/7';

  if (/^(4320P|8K)$/.test(compact)) return '8K';
  if (/^(3840P|2160P|UHD|4K)$/.test(compact)) return '4K';
  if (/^(1080P|FHD)$/.test(compact)) return 'FHD';
  if (/^(720P|HD)$/.test(compact)) return 'HD';
  if (/^(480P|SD)$/.test(compact)) return 'SD';
  if (/^(DOLBYVISION|DOVI|DV)$/.test(compact)) return 'DV';
  if (/^(HDR10PLUS|HDR10\+)$/.test(compact)) return 'HDR10+';
  if (compact === 'HDR10') return 'HDR10';
  if (compact === 'HDR') return 'HDR';
  if (compact === 'HLG') return 'HLG';
  if (/^(10BIT|10BITS)$/.test(compact)) return '10-Bit';
  if (/^(DOLBYATMOS|ATMOS)$/.test(compact)) return 'ATMOS';
  if (/^(DOLBYTRUEHD|TRUEHD)$/.test(compact)) return 'TrueHD';
  if (/^(DOLBYAUDIO|DOLBYDIGITAL|DOLBY)$/.test(compact)) return 'DOLBY';
  if (/^(DTS:X|DTSX)$/.test(compact)) return 'DTS:X';
  if (/^DTSHD(MA|HRA)?$/.test(compact)) return 'DTS-HD';
  if (compact === 'DTS') return 'DTS';
  if (/^(EAC3|DD\+)$/.test(compact)) return 'DD+';
  if (/^(H265|X265|HEVC)$/.test(compact)) return 'HEVC';
  if (/^(H264|X264|AVC)$/.test(compact)) return 'AVC';
  if (/^60FPS$/.test(compact)) return '60FPS';
  if (/^50FPS$/.test(compact)) return '50FPS';
  if (
    /^(GOLD|SILVER|PLATINUM|VIP|PREMIUM|PRO|ULTRA)RAW$/.test(compact) ||
    /^RAW(GOLD|SILVER|PLATINUM|VIP|PREMIUM|PRO|ULTRA)$/.test(compact)
  )
    return 'RAW';

  // Editions
  if (/^DIRECTOR'?S?CUT$/.test(compact)) return "Director's Cut";
  if (/^EXTENDED(CUT|EDITION)?$/.test(compact)) return 'Extended Cut';
  if (/^IMAX(ENHANCED)?$/.test(compact)) return 'IMAX';
  if (compact === 'REMASTERED') return 'Remastered';
  if (compact === 'UNRATED') return 'Unrated';
  if (/^THEATRICAL(CUT)?$/.test(compact)) return 'Theatrical';
  if (compact === 'SPECIALEDITION') return 'Special Edition';
  if (/^CRITERION(COLLECTION)?$/.test(compact)) return 'Criterion';
  if (/^FINALCUT$/.test(compact)) return 'Final Cut';
  if (/^ULTIMATE(EDITION)?$/.test(compact)) return 'Ultimate Edition';

  // Sources & Formats
  if (/^(BLURAY|BDRIP|BRRIP)$/.test(compact)) return 'BluRay';
  if (/^WEBDL$/.test(compact)) return 'WEB-DL';
  if (/^(WEBRIP|WEB)$/.test(compact)) return 'WEBRip';
  if (compact === 'REMUX') return 'Remux';
  if (compact === 'HDTV') return 'HDTV';
  if (/^(DVDRIP|DVD)$/.test(compact)) return 'DVD';

  // Multi-Audio & Subtitles
  if (/^(MULTIAUDIO|DUALAUDIO)$/.test(compact)) return 'Multi-Audio';
  if (/^MULTISUBS?$/.test(compact)) return 'Multi-Sub';
  if (compact === 'OMU') return 'OmU';
  if (compact === 'OMEU') return 'OmeU';
  if (compact === 'OV') return 'OV';
  if (compact === 'VOSTFR') return 'VOSTFR';
  if (compact === 'DUBBED') return 'Dubbed';
  if (compact === 'SUBBED') return 'Subbed';

  const canonical = [
    '7.1',
    '5.1',
    'AV1',
    'AC3',
    'AAC',
    'RAW',
    'VIP',
    'PPV',
    '3D',
    'GOLD',
    'SILVER',
    'PLATINUM',
    'PREMIUM',
    'ULTRA',
    'PRO',
    'VOD',
    'IPTV',
    'EPG',
  ].find((tag) => tag.replace('.', '') === compact.replace('.', ''));
  return canonical ?? null;
}

export function isKnownMediaTag(value: string): boolean {
  return normalizeMediaTag(value) !== null;
}

export function getMediaTagCategory(tag: string): TagCategory {
  const normalized = normalizeMediaTag(tag) ?? tag;
  if (/^(8K|4K|FHD|HD|SD)$/.test(normalized)) return 'resolution';
  if (/^(60FPS|50FPS)$/.test(normalized)) return 'fps';
  if (
    /^(ATMOS|TrueHD|DTS:X|DTS-HD|DTS|DOLBY|DD\+|7\.1|5\.1|AC3|AAC|Multi-Audio|Multi-Sub|OmU|OmeU|OV|VOSTFR|Dubbed|Subbed)$/.test(
      normalized,
    )
  ) {
    return 'audio';
  }
  if (
    /^(Director's Cut|Extended Cut|IMAX|Remastered|Unrated|Theatrical|Special Edition|Criterion|Final Cut|Ultimate Edition)$/.test(
      normalized,
    )
  ) {
    return 'edition';
  }
  return 'format';
}

export function extractMediaTags(value: string): { cleanText: string; tags: string[] } {
  if (!value) return { cleanText: '', tags: [] };
  const normalizedValue = normalizeFancyUnicode(value);
  const found: string[] = [];
  const cleanText = normalizedValue.replace(TAG_PATTERN, (match) => {
    const normalized = normalizeMediaTag(match);
    if (normalized && !NON_DISPLAY_MARKERS.has(normalized) && !found.includes(normalized)) {
      found.push(normalized);
    }
    return ' ';
  });

  const priority = (tag: string) => {
    const index = TAG_PRIORITY.indexOf(tag);
    return index === -1 ? TAG_PRIORITY.length : index;
  };

  return { cleanText, tags: found.sort((left, right) => priority(left) - priority(right)) };
}

export function mergeMediaTags(...values: Array<string | null | undefined>): string[] {
  const tags = values.flatMap((value) => (value ? extractMediaTags(value).tags : []));
  return [...new Set(tags)].sort((left, right) => {
    const leftIndex = TAG_PRIORITY.indexOf(left);
    const rightIndex = TAG_PRIORITY.indexOf(right);
    return (
      (leftIndex < 0 ? TAG_PRIORITY.length : leftIndex) -
      (rightIndex < 0 ? TAG_PRIORITY.length : rightIndex)
    );
  });
}

/**
 * Filter tags based on user visibility settings.
 */
export function filterMediaTagsByVisibility(
  tags: readonly string[],
  visibility?: {
    resolution?: boolean | undefined;
    fps?: boolean | undefined;
    audio?: boolean | undefined;
    edition?: boolean | undefined;
  },
): string[] {
  if (!visibility) return [...tags];
  return tags.filter((tag) => {
    const category = getMediaTagCategory(tag);
    if (category === 'resolution' && visibility.resolution === false) return false;
    if (category === 'fps' && visibility.fps === false) return false;
    if (category === 'audio' && visibility.audio === false) return false;
    if (category === 'edition' && visibility.edition === false) return false;
    return true;
  });
}

/**
 * Keep technical metadata useful without letting repeated provider markers
 * dominate compact surfaces. Tags are already sorted by semantic priority.
 */
export function getPrimaryMediaTags(tags: readonly string[], limit = 2): string[] {
  return tags.slice(0, Math.max(0, limit));
}

/**
 * A verified resolution — measured from the actually-decoded video — can
 * disagree with what the provider's own title/EPG text claims (e.g. a
 * channel or programme labelled "4K" that's really streaming 1080p). Once
 * that ground truth is known, it replaces the provider's resolution guess
 * instead of being shown alongside it; two conflicting resolution badges
 * reads as a bug, not two facts.
 */
export function withVerifiedResolution(
  providerTags: readonly string[],
  verifiedBadge: string | null | undefined,
): string[] {
  if (!verifiedBadge) return [...providerTags];
  return mergeMediaTags(
    verifiedBadge,
    ...providerTags.filter((tag) => getMediaTagCategory(tag) !== 'resolution'),
  );
}

/**
 * Whether an item belongs in a "4K/Ultra HD" grouping (a smart category tab,
 * a count next to one). Same precedence as withVerifiedResolution: a known
 * verified resolution is ground truth and decides it on its own — a channel
 * whose name says "4K" but actually streams 1080p does not belong in a 4K
 * filter just because the provider says so. Only falls back to the
 * title/quality/tags claim when nothing has been verified yet.
 */
export function isUltraHdQuality(
  item: {
    title: string;
    quality?: string | null | undefined;
    tags?: readonly string[] | undefined;
  },
  verifiedBadge?: string | null | undefined,
): boolean {
  if (verifiedBadge) {
    const normalized = normalizeMediaTag(verifiedBadge) ?? verifiedBadge;
    return normalized === '4K' || normalized === '8K';
  }
  const declared = mergeMediaTags(item.title, item.quality, ...(item.tags ?? []));
  return declared.includes('4K') || declared.includes('8K');
}

export function getTagColorType(tag: string): TagColorType {
  const normalized = normalizeMediaTag(tag) ?? tag.trim().toUpperCase();
  if (
    normalized === '8K' ||
    normalized === '4K' ||
    normalized === 'IMAX' ||
    normalized === 'Ultimate Edition'
  )
    return 'gold';
  if (
    normalized === 'FHD' ||
    normalized === 'HD' ||
    normalized === 'Extended Cut' ||
    normalized === 'Remastered' ||
    normalized === 'BluRay' ||
    normalized === 'Remux'
  )
    return 'cyan';
  if (
    normalized === 'DV' ||
    normalized === 'ATMOS' ||
    normalized === 'DOLBY' ||
    normalized === "Director's Cut" ||
    normalized === 'Final Cut' ||
    normalized === 'Criterion'
  )
    return 'purple';
  if (
    normalized.startsWith('HDR') ||
    normalized === 'HLG' ||
    normalized === '24/7' ||
    normalized === 'WEB-DL' ||
    normalized === 'WEBRip'
  )
    return 'blue';
  if (
    /^(DTS:X|DTS-HD|DTS|TrueHD|DD\+|7\.1|5\.1|AC3|AAC|Multi-Audio|Multi-Sub|OmU|OmeU|OV|VOSTFR|Dubbed|Subbed)$/.test(
      normalized,
    )
  )
    return 'green';
  if (/^(RAW|60FPS|50FPS|PPV|3D|Unrated|10-Bit)$/.test(normalized)) return 'coral';
  return 'silver';
}
