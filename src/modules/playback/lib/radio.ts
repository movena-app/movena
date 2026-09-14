/** Values commonly produced by an M3U attribute parser. */
export type M3uLikeAttributeValue = string | number | boolean | null | undefined;

export type M3uLikeAttributes = Readonly<Record<string, M3uLikeAttributeValue>>;

export interface RadioDisplayMetadata {
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
  genre?: string | undefined;
  channelNumber?: string | undefined;
  logoUrl?: string | undefined;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);
const MAX_TITLE_LENGTH = 160;
const MAX_METADATA_LENGTH = 120;
const MAX_CHANNEL_NUMBER_LENGTH = 24;
const MAX_LOGO_URL_LENGTH = 2048;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;
const BIDI_CONTROL_PATTERN = /[\u202a-\u202e\u2066-\u2069]/g;

function attributeValue(
  attributes: M3uLikeAttributes,
  requestedKey: string,
): M3uLikeAttributeValue {
  const normalizedKey = requestedKey.trim().toLowerCase();
  const matchingKey = Object.keys(attributes).find(
    (key) => key.trim().toLowerCase() === normalizedKey,
  );
  return matchingKey === undefined ? undefined : attributes[matchingKey];
}

function normalizedText(value: M3uLikeAttributeValue, maxLength: number): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;

  const text = String(value)
    .normalize('NFKC')
    .replace(CONTROL_CHARACTER_PATTERN, ' ')
    .replace(BIDI_CONTROL_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();

  return text || undefined;
}

function firstText(
  attributes: M3uLikeAttributes,
  keys: readonly string[],
  maxLength: number,
): string | undefined {
  for (const key of keys) {
    const value = normalizedText(attributeValue(attributes, key), maxLength);
    if (value) return value;
  }
  return undefined;
}

/**
 * Detect the opt-in radio marker used by M3U-like playlists.
 *
 * Unknown or malformed values intentionally return false so a provider cannot
 * accidentally force an audio-only presentation for an ordinary stream.
 */
export function isRadioStream(attributes: M3uLikeAttributes): boolean {
  const value = attributeValue(attributes, 'radio');
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized) || normalized === '') return false;
  return false;
}

function safeLogoUrl(value: M3uLikeAttributeValue): string | undefined {
  const normalized = normalizedText(value, MAX_LOGO_URL_LENGTH);
  if (!normalized || normalized.length > MAX_LOGO_URL_LENGTH) return undefined;

  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize untrusted station metadata for an audio-only surface.
 *
 * `title` is the title after the comma in an EXTINF line when available. It
 * takes precedence over attribute-derived names; the optional fallback is
 * used only when neither source contains usable text.
 */
export function normalizeRadioDisplayMetadata(
  attributes: M3uLikeAttributes,
  title?: M3uLikeAttributeValue,
  fallbackTitle = 'Radio stream',
): RadioDisplayMetadata {
  const normalizedTitle =
    normalizedText(title, MAX_TITLE_LENGTH) ??
    firstText(
      attributes,
      ['title', 'tvg-name', 'station-name', 'radio-name', 'channel-name', 'name'],
      MAX_TITLE_LENGTH,
    ) ??
    normalizedText(fallbackTitle, MAX_TITLE_LENGTH) ??
    'Radio stream';

  const metadata: RadioDisplayMetadata = { title: normalizedTitle };
  const artist = firstText(
    attributes,
    ['artist', 'tvg-artist', 'station-artist'],
    MAX_METADATA_LENGTH,
  );
  const album = firstText(attributes, ['album', 'tvg-album', 'station-album'], MAX_METADATA_LENGTH);
  const genre = firstText(attributes, ['genre', 'tvg-genre', 'station-genre'], MAX_METADATA_LENGTH);
  const channelNumber = firstText(
    attributes,
    ['tvg-chno', 'channel-number', 'channel'],
    MAX_CHANNEL_NUMBER_LENGTH,
  );
  const logoUrl = safeLogoUrl(
    attributeValue(attributes, 'tvg-logo') ??
      attributeValue(attributes, 'logo') ??
      attributeValue(attributes, 'logo-url'),
  );

  if (artist) metadata.artist = artist;
  if (album) metadata.album = album;
  if (genre) metadata.genre = genre;
  if (channelNumber) metadata.channelNumber = channelNumber;
  if (logoUrl) metadata.logoUrl = logoUrl;

  return metadata;
}
