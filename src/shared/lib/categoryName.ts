import { countries as FLAG_COUNTRY_CODES } from 'country-flag-icons';
import { extractMediaTags, isKnownMediaTag, normalizeMediaTag } from '@/shared/lib/mediaTags';
import { normalizeFancyUnicode } from '@/shared/lib/textNormalization';
import type { UiLanguage } from '@/shared/i18n/config';

/**
 * Providers put the country in front of a category name, but not consistently:
 * live TV uses `DE| SKY GO CINEMA VIP`, while the series catalogue spells it out
 * as `GERMANY NETFLIX`. Both forms are recognised so the sidebar can group by
 * country instead of repeating the same word down the whole column.
 */
export interface ParsedCategory {
  /** Upper-case ISO-3166 alpha-2 code, when the name carried one. */
  country: string | null;
  /** The name with the country prefix and format tags removed. */
  label: string;
  /** Extracted format/quality tags (e.g. ['4K', 'HD', 'RAW']). */
  tags?: string[] | undefined;
  /** Topic cluster classification (24/7, cinema, streaming, general) */
  cluster?: CategoryCluster | undefined;
}

/** Stable product wording where `Intl.DisplayNames` varies between platforms. */
const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  AL: 'Albania',
  AR: 'Argentina',
  AT: 'Austria',
  BA: 'Bosnia and Herzegovina',
  BE: 'Belgium',
  BG: 'Bulgaria',
  BR: 'Brazil',
  CA: 'Canada',
  CH: 'Switzerland',
  CZ: 'Czechia',
  DE: 'Germany',
  DK: 'Denmark',
  EE: 'Estonia',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  GR: 'Greece',
  HR: 'Croatia',
  HU: 'Hungary',
  HK: 'Hong Kong',
  IE: 'Ireland',
  IT: 'Italy',
  LT: 'Lithuania',
  LV: 'Latvia',
  MK: 'North Macedonia',
  MT: 'Malta',
  MO: 'Macau',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russia',
  SE: 'Sweden',
  SI: 'Slovenia',
  SK: 'Slovakia',
  TR: 'Türkiye',
  UA: 'Ukraine',
  US: 'United States',
  XK: 'Kosovo',
};

/**
 * Full English region names for every flag we can render. This keeps category
 * parsing aligned with the flag package instead of maintaining a partial list.
 */
export const COUNTRY_NAMES: Record<string, string> = (() => {
  const names: Record<string, string> = {};
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    // The explicit overrides still provide a useful baseline on old webviews.
  }
  for (const code of FLAG_COUNTRY_CODES) {
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const label = displayNames?.of(code);
    if (label && label !== code) names[code] = label;
  }
  return { ...names, ...COUNTRY_NAME_OVERRIDES };
})();

/**
 * Codes providers use that are not ISO-3166 alpha-2 or common 3-letter codes.
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  EL: 'GR',
  EN: 'GB',
  SR: 'RS',
  UK: 'GB',
  GER: 'DE',
  DEU: 'DE',
  ENG: 'GB',
  USA: 'US',
  FRA: 'FR',
  FRE: 'FR',
  ITA: 'IT',
  ESP: 'ES',
  SPA: 'ES',
  POR: 'PT',
  BRA: 'BR',
  RUS: 'RU',
  TUR: 'TR',
  POL: 'PL',
  NED: 'NL',
  DUT: 'NL',
  NLD: 'NL',
  SWE: 'SE',
  NOR: 'NO',
  DAN: 'DK',
  DEN: 'DK',
  FIN: 'FI',
  GRE: 'GR',
  CZE: 'CZ',
  HUN: 'HU',
  ROU: 'RO',
  ROM: 'RO',
  BUL: 'BG',
  SRB: 'RS',
  CRO: 'HR',
  ALB: 'AL',
  UKR: 'UA',
  ARA: 'SA',
  HIN: 'IN',
  CHI: 'CN',
  JPN: 'JP',
  KOR: 'KR',
};

export function normalizeCountryCode(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_ALIASES[code] ?? code;
}

/** True when a normalized provider country can map to an ISO flag asset. */
export function hasCountryFlag(code: string | null): boolean {
  const normalized = normalizeCountryCode(code);
  return Boolean(normalized && /^[A-Z]{2}$/.test(normalized));
}

const localizedCountryNames = new Map<string, Intl.DisplayNames>();

const OTHER_COUNTRY_LABELS: Record<UiLanguage, string> = {
  en: 'Other',
  de: 'Andere',
  es: 'Otro',
  fr: 'Autre',
  'pt-BR': 'Outro',
  it: 'Altro',
  nl: 'Overig',
  pl: 'Inne',
};

export function countryName(code: string | null, language: UiLanguage = 'en'): string {
  const key = normalizeCountryCode(code);
  if (!key) return OTHER_COUNTRY_LABELS[language];
  if (language !== 'en') {
    try {
      let displayNames = localizedCountryNames.get(language);
      if (!displayNames) {
        displayNames = new Intl.DisplayNames([language], { type: 'region' });
        localizedCountryNames.set(language, displayNames);
      }
      const localized = displayNames.of(key);
      if (localized && localized !== key) return localized;
    } catch {
      // Fall back to the stable English catalogue below on older webviews.
    }
  }
  return COUNTRY_NAMES[key] ?? key;
}

/** `DE|`, `DE |`, `DE -` and `DE:` all appear in the wild. */
const CODE_PREFIX = /^\s*([A-Za-z]{2,3})\s*[|\-:]\s*(.+)$/;

/** Common short, legacy, and IPTV-specific spellings. */
const EXTRA_NAMES: Record<string, string> = {
  AMERICA: 'US',
  BOLIVIA: 'BO',
  BOSNIA: 'BA',
  BRUNEI: 'BN',
  'CAPE VERDE': 'CV',
  CONGO: 'CG',
  'CONGO BRAZZAVILLE': 'CG',
  'CONGO KINSHASA': 'CD',
  'CZECH REPUBLIC': 'CZ',
  'DR CONGO': 'CD',
  ENGLAND: 'GB',
  HOLLAND: 'NL',
  'HONG KONG': 'HK',
  'IVORY COAST': 'CI',
  KOREA: 'KR',
  LAOS: 'LA',
  MACAO: 'MO',
  MACAU: 'MO',
  MACEDONIA: 'MK',
  MICRONESIA: 'FM',
  MOLDAVIA: 'MD',
  PALESTINE: 'PS',
  RUSSIA: 'RU',
  'SOUTH KOREA': 'KR',
  SRBIJA: 'RS',
  SWAZILAND: 'SZ',
  SYRIA: 'SY',
  TAIWAN: 'TW',
  TANZANIA: 'TZ',
  TURKEY: 'TR',
  UK: 'GB',
  USA: 'US',
  VATICAN: 'VA',
  VENEZUELA: 'VE',
  VIETNAM: 'VN',
};

const normalizeCountryName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' AND ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const PREFIX_NAME_TO_CODE: Record<string, string> = { ...EXTRA_NAMES };
const NORMALIZED_NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
  PREFIX_NAME_TO_CODE[name.toUpperCase()] = code;
}
for (const [name, code] of Object.entries(PREFIX_NAME_TO_CODE)) {
  NORMALIZED_NAME_TO_CODE[normalizeCountryName(name)] = code;
}

function countryCodeForName(value: string): string | null {
  const normalized = normalizeCountryName(value);
  const candidate =
    NORMALIZED_NAME_TO_CODE[normalized] ?? (/^[A-Z]{2,3}$/.test(normalized) ? normalized : null);
  const code = normalizeCountryCode(candidate);
  return code && COUNTRY_NAMES[code] ? code : null;
}

/** Whether a label is only another spelling or code for the given country. */
export function isCountryOnlyLabel(label: string, country: string | null): boolean {
  const target = normalizeCountryCode(country);
  if (!target) return false;
  return countryCodeForName(label) === target;
}

/** Longest first, so `UNITED KINGDOM` is not cut short by a shorter match. */
const NAME_PREFIXES = Object.keys(PREFIX_NAME_TO_CODE).sort((a, b) => b.length - a.length);

type CategoryCluster = '247' | 'cinema' | 'streaming' | 'general';

function getCategoryCluster(label: string, rawName?: string): CategoryCluster {
  const upper = normalizeFancyUnicode(`${label} ${rawName || ''}`)
    .replace(/24\s*[/\\\\]\s*7/gi, '24/7')
    .toUpperCase();

  // 1. Check 24/7 explicit streams first
  if (upper.includes('24/7') || upper.includes('247')) {
    return '247';
  }

  // 2. Check Streaming brands (Disney+, Apple+, Paramount+, Netflix, Prime, Joyn, RTL+, WOW, HBO, Plex, Magenta)
  if (
    /\b(NETFLIX|DISNEY\+?|APPLE\+?|HULU|PARAMOUNT\+?|AMAZON|PRIME|JOYN|RTL\+?|WOW|PLEX|HBO|MAGENTA)\b/.test(
      upper,
    )
  ) {
    return 'streaming';
  }

  // 3. Check Cinema & Movies (prevent Sports channels with PPV from being dumped into Cinema)
  if (/\b(CINEMA|MOVIES|FILME|FILM|FILMA|BOXOFFICE)\b/.test(upper)) {
    return 'cinema';
  }
  if (
    upper.includes('PPV') &&
    !/\b(SPORT|SPORTS|UFC|WWE|DAZN|ESPN|EUROSPORT|F1|MOTOGP|FOOTBALL|SOCCER)\b/.test(upper)
  ) {
    return 'cinema';
  }

  // 4. General / Sports / Other
  return 'general';
}

/**
 * Format category label nicely: title-cases standard words while keeping acronyms uppercase.
 */
function formatCategoryLabel(label: string): string {
  if (!label) return '';

  const normalized = label
    .replace(/24\s*[/\\\\]\s*7/gi, '24/7')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/24\s*\/\s*7/gi, '24/7')
    .replace(/\s+/g, ' ')
    .trim();

  // If label is already mixed case (e.g. "Sky Cinema"), preserve it
  const hasLower = /[a-z]/.test(normalized);
  const hasUpper = /[A-Z]/.test(normalized);
  if (hasLower && hasUpper) return normalized;

  return normalized
    .split(/(\s+|[/\-:|]+)/)
    .map((token) => {
      const upperToken = token.toUpperCase();
      if (isKnownMediaTag(upperToken)) {
        return normalizeMediaTag(upperToken) ?? upperToken;
      }
      if (/^[A-Za-z]+$/.test(token)) {
        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      }
      return token;
    })
    .join('');
}

const CATEGORY_PROMOTIONAL_FLUFF =
  /\b(?:INF\s*(?:&|\+)\s*(?:EVENTS|CHANNELS)?|INF\s*&|GOLD|SILVER|PLATINUM|VIP|PREMIUM|ULTRA|PRO|RAW)\b/gi;

function extractCategoryTags(label: string): { cleanLabel: string; tags: string[] } {
  if (!label) return { cleanLabel: '', tags: [] };

  const { cleanText, tags } = extractMediaTags(label);
  let clean = cleanText
    .replace(CATEGORY_PROMOTIONAL_FLUFF, ' ')
    .replace(/\s*[/|\-:]\s*[/|\-:]+/g, ' /')
    .replace(/[\s/\-:|&]+$/, '')
    .replace(/^[\s/\-:|&]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) {
    const fallbackWithoutPromo = label
      .replace(CATEGORY_PROMOTIONAL_FLUFF, ' ')
      .replace(/24\s*[/\\\\]\s*7/gi, '24/7')
      .replace(/[\s/\-:|&]+$/, '')
      .replace(/^[\s/\-:|&]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (fallbackWithoutPromo) clean = fallbackWithoutPromo;
  }

  // Categories should only carry genuine resolution/format tags, never promo or internal RAW markers
  let filteredTags = tags.filter((t) => /^(8K|4K|FHD|HD|SD|HEVC|AV1|3D|24\/7|BluRay)$/i.test(t));
  const cleanLabel = clean ? formatCategoryLabel(clean) : 'General';
  if (cleanLabel === '24/7') {
    filteredTags = [];
  }

  return {
    cleanLabel,
    tags: filteredTags,
  };
}

export function parseCategoryName(name: string): ParsedCategory {
  let trimmed = normalizeFancyUnicode(name || '').trim();
  // Strip decorative leading and trailing hashes (#), asterisks (*), equals (=), dashes (-), tildes (~)
  trimmed =
    trimmed
      .replace(/^[\s#*=_~\-\|:]+/, '')
      .replace(/[\s#*=_~\-\|:]+$/, '')
      .trim() || trimmed;

  let country: string | null = null;
  let label = trimmed;

  // 1. Try CODE_PREFIX e.g. "DE| SKY GO CINEMA VIP".
  const coded = trimmed.match(CODE_PREFIX);
  const codedCountry = coded?.[1] ? normalizeCountryCode(coded[1].toUpperCase()) : null;
  if (coded && codedCountry && COUNTRY_NAMES[codedCountry]) {
    country = codedCountry;
    label = coded[2]?.trim() ?? label;
  } else {
    // 2. Resolve a complete country label, including provider aliases.
    const exactCountry = countryCodeForName(trimmed);
    if (exactCountry) {
      country = exactCountry;
      label = countryName(exactCountry);
    } else {
      // 3. Try country-name prefixes e.g. "GERMANY NETFLIX".
      const upper = trimmed.toUpperCase();
      for (const prefix of NAME_PREFIXES) {
        if (!upper.startsWith(prefix)) continue;
        const rest = trimmed.slice(prefix.length);
        if (rest && !/^[\s|\-:]/.test(rest)) continue;
        country = PREFIX_NAME_TO_CODE[prefix] ?? null;
        label = rest.replace(/^[\s|\-:]+/, '').trim() || countryName(country);
        break;
      }

      // 4. Multilingual playlists often use `local name / English name`.
      if (!country) {
        const segments = trimmed.split(/\s*[|/·]\s*/).filter(Boolean);
        for (const segment of segments) {
          const segmentCountry = countryCodeForName(segment);
          if (!segmentCountry) continue;
          country = segmentCountry;
          label = countryName(segmentCountry);
          break;
        }
      }
    }
  }

  // 5. Strip secondary/redundant country name or code prefix if present in the label
  if (country) {
    const fullCountryName = countryName(country).toUpperCase();
    const codeUpper = country.toUpperCase();
    const labelUpper = label.toUpperCase();

    if (labelUpper.startsWith(fullCountryName)) {
      const rest = label
        .slice(fullCountryName.length)
        .replace(/^[\s|\-:]+/, '')
        .trim();
      if (rest) label = rest;
    } else if (labelUpper.startsWith(codeUpper)) {
      const rest = label
        .slice(codeUpper.length)
        .replace(/^[\s|\-:]+/, '')
        .trim();
      if (rest) label = rest;
    }
  }

  // 6. Extract format & quality tags (e.g. 4K, HD, RAW, HEVC)
  const { cleanLabel, tags } = extractCategoryTags(label);
  const cluster = getCategoryCluster(cleanLabel, name);

  return {
    country: normalizeCountryCode(country),
    label: cleanLabel,
    tags,
    cluster,
  };
}
