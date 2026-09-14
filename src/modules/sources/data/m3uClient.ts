import { isRadioStream, normalizeRadioDisplayMetadata } from '@/modules/playback/public/lib/radio';

export type M3uMediaType = 'live' | 'vod' | 'series';

export interface M3uEpisodeIdentity {
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | undefined;
}

export interface M3uEntry {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  type: M3uMediaType;
  duration: number;
  groupTitle: string;
  categoryId: string;
  tvgId?: string | undefined;
  tvgName?: string | undefined;
  logo?: string | undefined;
  channelNumber?: string | undefined;
  description?: string | undefined;
  year?: string | undefined;
  rating?: number | undefined;
  headers: Record<string, string>;
  /** Effective source headers that are runtime-only and must never be exported. */
  inheritedHeaderNames?: string[] | undefined;
  catchup?: string | undefined;
  catchupSource?: string | undefined;
  catchupDays?: number | undefined;
  radio?: boolean | undefined;
  radioMetadata?: ReturnType<typeof normalizeRadioDisplayMetadata> | undefined;
  episode?: M3uEpisodeIdentity | undefined;
  /** Vendor attributes that Movena does not interpret but must preserve. */
  extraAttributes?: Record<string, string> | undefined;
  /** Entry-scoped directives/comments that Movena does not interpret. */
  extraDirectives?: string[] | undefined;
}

export interface M3uPlaylist {
  name?: string | undefined;
  epgUrls: string[];
  entries: M3uEntry[];
  warnings: string[];
  /** Header attributes and top-level directives preserved for lossless editing. */
  extraHeaderAttributes?: Record<string, string> | undefined;
  extraDirectives?: string[] | undefined;
}

export interface ParseM3uOptions {
  sourceId: string;
  baseUrl?: string | undefined;
  headers?: Record<string, string> | undefined;
}

interface PendingEntry {
  duration: number;
  title: string;
  attributes: Record<string, string>;
  groupTitle?: string | undefined;
  headers: Record<string, string>;
  directives: string[];
}

const KNOWN_ENTRY_ATTRIBUTES = new Set([
  'tvg-id',
  'channel-id',
  'tvg-name',
  'tvg-logo',
  'logo',
  'tvg-chno',
  'channel-number',
  'group-title',
  'catchup',
  'catchup-source',
  'catchup-days',
  'timeshift',
  'description',
  'tvg-description',
  'year',
  'rating',
  'tvg-rating',
  'radio',
  'radio-id',
  'radio-name',
  'radio-logo',
  'movena-type',
]);

const KNOWN_HEADER_ATTRIBUTES = new Set([
  'x-tvg-url',
  'url-tvg',
  'tvg-url',
  'playlist-name',
  'name',
]);

const ATTRIBUTE_PATTERN = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
const HLS_MANIFEST_PATTERN =
  /^#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|KEY|MAP|PART|ENDLIST)/m;

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(value))) {
    const name = match[1];
    if (name) attributes[name.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function splitExtinf(value: string): { metadata: string; title: string } {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === '"' || character === "'") && (quote === null || quote === character)) {
      quote = quote === character ? null : character;
    } else if (character === ',' && quote === null) {
      return { metadata: value.slice(0, index), title: value.slice(index + 1).trim() };
    }
  }
  return { metadata: value, title: '' };
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

function canonicalHeaderName(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (key === 'user-agent' || key === 'http-user-agent') return 'User-Agent';
  if (key === 'referer' || key === 'referrer' || key === 'http-referrer') return 'Referer';
  if (key === 'origin' || key === 'http-origin') return 'Origin';
  if (key === 'cookie' || key === 'http-cookie') return 'Cookie';
  if (/^[a-z0-9!#$%&'*+.^_`|~-]+$/i.test(key)) {
    return key
      .split('-')
      .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
      .join('-');
  }
  return null;
}

function addHeader(headers: Record<string, string>, name: string, value: string): void {
  const canonical = canonicalHeaderName(name);
  const cleaned = value.trim();
  if (!canonical || !cleaned || /[\r\n]/.test(cleaned) || Object.keys(headers).length >= 16) return;
  headers[canonical] = cleaned.slice(0, 4096);
}

function parseHeaderPairs(value: string, headers: Record<string, string>): void {
  for (const pair of value.split('&')) {
    const equals = pair.indexOf('=');
    if (equals <= 0) continue;
    addHeader(
      headers,
      decodeHeaderValue(pair.slice(0, equals)),
      decodeHeaderValue(pair.slice(equals + 1)),
    );
  }
}

function splitUrlHeaders(value: string): { url: string; headers: Record<string, string> } {
  const separator = value.lastIndexOf('|');
  if (separator <= 0 || !value.slice(separator + 1).includes('='))
    return { url: value.trim(), headers: {} };
  const headers: Record<string, string> = {};
  parseHeaderPairs(value.slice(separator + 1), headers);
  return Object.keys(headers).length > 0
    ? { url: value.slice(0, separator).trim(), headers }
    : { url: value.trim(), headers: {} };
}

function resolveEntryUrl(
  rawValue: string,
  baseUrl?: string,
): { url: string; headers: Record<string, string> } {
  const split = splitUrlHeaders(rawValue.trim());
  if (
    !baseUrl ||
    /^[a-z][a-z0-9+.-]*:/i.test(split.url) ||
    /^[a-z]:[\\/]/i.test(split.url) ||
    split.url.startsWith('\\\\')
  ) {
    return split;
  }
  try {
    return { ...split, url: new URL(split.url.replace(/\\/g, '/'), baseUrl).toString() };
  } catch {
    return split;
  }
}

function titleFromUrl(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? '';
  const finalPart = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Untitled stream';
  try {
    return (
      decodeURIComponent(finalPart)
        .replace(/\.[^.]+$/, '')
        .replace(/[._]+/g, ' ')
        .trim() || 'Untitled stream'
    );
  } catch {
    return (
      finalPart
        .replace(/\.[^.]+$/, '')
        .replace(/[._]+/g, ' ')
        .trim() || 'Untitled stream'
    );
  }
}

export function parseM3uEpisodeTitle(title: string): M3uEpisodeIdentity | undefined {
  const patterns = [
    /^(.*?)[\s._-]+S(\d{1,3})[\s._-]*E(\d{1,3})(?:[\s._-]+(.*))?$/i,
    /^(.*?)[\s._-]+(\d{1,3})x(\d{1,3})(?:[\s._-]+(.*))?$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(title.trim());
    if (!match) continue;
    const seriesTitle = (match[1] ?? '')
      .replace(/[._]+/g, ' ')
      .replace(/[\s_-]+$/, '')
      .trim();
    if (!seriesTitle) return undefined;
    const episodeTitle = match[4]
      ?.replace(/[._]+/g, ' ')
      .replace(/^[\s_-]+/, '')
      .trim();
    return {
      seriesTitle,
      seasonNumber: Number(match[2]),
      episodeNumber: Number(match[3]),
      episodeTitle: episodeTitle || undefined,
    };
  }
  return undefined;
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * M3U has no formal media-kind field, so classify from the signals providers
 * actually emit. Episode notation is the strongest signal; a positive EXTINF
 * duration is the next best indication of seekable VOD. Group labels fill in
 * the common vendor convention for movie libraries. Everything else remains
 * live, which keeps ambiguous streams safe on the linear-player path.
 */
function classifyMediaType(
  groupTitle: string,
  duration: number,
  episode: M3uEpisodeIdentity | undefined,
): M3uMediaType {
  if (episode) return 'series';
  if (duration > 0) return 'vod';
  const group = groupTitle.toLowerCase();
  if (/\b(?:movie|movies|film|films|vod|cinema)\b/.test(group)) return 'vod';
  // Do not classify a bare "Series" group as a series: it has no episode
  // identity to browse or resume correctly. Likewise, vendor paths and a
  // title such as "Library Film" are too ambiguous to force into VOD.
  return 'live';
}

function createEntry(
  pending: PendingEntry,
  rawUrl: string,
  options: ParseM3uOptions,
): M3uEntry | null {
  const resolved = resolveEntryUrl(rawUrl, options.baseUrl);
  if (!resolved.url) return null;
  const attributes = pending.attributes;
  const title = pending.title || attributes['tvg-name'] || titleFromUrl(resolved.url);
  const groupTitle = pending.groupTitle || attributes['group-title'] || 'Uncategorized';
  const episode = parseM3uEpisodeTitle(title);
  const tvgId = attributes['tvg-id'] || attributes['channel-id'] || undefined;
  const identity = `${options.sourceId}|${tvgId || ''}|${resolved.url}|${title}`;
  const sourceHeaders = options.headers ?? {};
  const entryHeaders = { ...pending.headers, ...resolved.headers };
  const explicitHeaderNames = new Set(Object.keys(entryHeaders).map((name) => name.toLowerCase()));
  const inheritedHeaderNames = Object.keys(sourceHeaders).filter(
    (name) => !explicitHeaderNames.has(name.toLowerCase()),
  );
  const headers = { ...sourceHeaders, ...entryHeaders };
  const catchupDays = parseFiniteNumber(attributes['catchup-days'] || attributes.timeshift);
  const radio = isRadioStream(attributes);
  const rating = parseFiniteNumber(attributes.rating || attributes['tvg-rating']);
  const yearMatch = (attributes.year || title).match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  const inferredType = classifyMediaType(groupTitle, pending.duration, episode);
  const type =
    attributes['movena-type'] === 'vod' ||
    attributes['movena-type'] === 'series' ||
    attributes['movena-type'] === 'live'
      ? attributes['movena-type']
      : inferredType;
  const extraAttributes = Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !KNOWN_ENTRY_ATTRIBUTES.has(key)),
  );

  return {
    id: `m3u-${fnv1a(identity)}`,
    sourceId: options.sourceId,
    title,
    url: resolved.url,
    type,
    duration: pending.duration,
    groupTitle,
    categoryId: `m3u-category-${fnv1a(`${options.sourceId}|${type}|${groupTitle.toLowerCase()}`)}`,
    tvgId,
    tvgName: attributes['tvg-name'] || undefined,
    logo: attributes['tvg-logo'] || attributes.logo || undefined,
    channelNumber: attributes['tvg-chno'] || attributes['channel-number'] || undefined,
    description: attributes.description || attributes['tvg-description'] || undefined,
    year: yearMatch?.[1],
    rating,
    headers,
    inheritedHeaderNames: inheritedHeaderNames.length > 0 ? inheritedHeaderNames : undefined,
    catchup: attributes.catchup || undefined,
    catchupSource: attributes['catchup-source'] || undefined,
    catchupDays,
    radio,
    radioMetadata: radio
      ? normalizeRadioDisplayMetadata(attributes, title, titleFromUrl(resolved.url))
      : undefined,
    episode,
    extraAttributes: Object.keys(extraAttributes).length > 0 ? extraAttributes : undefined,
    extraDirectives: pending.directives.length > 0 ? pending.directives : undefined,
  };
}

function parseExtHttp(value: string, headers: Record<string, string>): void {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    for (const [name, headerValue] of Object.entries(parsed)) {
      if (typeof headerValue === 'string') addHeader(headers, name, headerValue);
    }
  } catch {
    // Invalid vendor metadata should not discard the playable entry.
  }
}

export function parseM3u(content: string, options: Partial<ParseM3uOptions> = {}): M3uPlaylist {
  const safeOptions: ParseM3uOptions = {
    sourceId: options.sourceId || 'm3u-source',
    baseUrl: options.baseUrl,
    headers: options.headers,
  };
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (HLS_MANIFEST_PATTERN.test(normalized)) {
    throw new Error('This file is an HLS stream manifest, not a channel playlist.');
  }

  const lines = normalized.split('\n');
  const warnings: string[] = [];
  const entries: M3uEntry[] = [];
  const seenIds = new Set<string>();
  const header =
    lines.find((line) => line.trim().toUpperCase().startsWith('#EXTM3U'))?.trim() ?? '';
  const headerAttributes = parseAttributes(header.slice('#EXTM3U'.length));
  const extraHeaderAttributes = Object.fromEntries(
    Object.entries(headerAttributes).filter(([key]) => !KNOWN_HEADER_ATTRIBUTES.has(key)),
  );
  const epgUrls = unique(
    [headerAttributes['x-tvg-url'], headerAttributes['url-tvg'], headerAttributes['tvg-url']]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(/\s*[,;]\s*/)),
  ).map((value) => resolveEntryUrl(value, safeOptions.baseUrl).url);
  let playlistName = headerAttributes['playlist-name'] || headerAttributes.name || undefined;
  let pending: PendingEntry | null = null;
  const extraDirectives: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]?.trim();
    if (!line) continue;

    if (line.toUpperCase().startsWith('#PLAYLIST:')) {
      playlistName = line.slice(line.indexOf(':') + 1).trim() || playlistName;
      continue;
    }
    if (line.toUpperCase().startsWith('#EXTINF:')) {
      if (pending) warnings.push(`Entry near line ${lineIndex + 1} has no media URL`);
      const split = splitExtinf(line.slice(line.indexOf(':') + 1));
      const durationToken = split.metadata.trim().split(/\s+/, 1)[0] ?? '';
      const duration = Number.parseFloat(durationToken);
      pending = {
        duration: Number.isFinite(duration) ? duration : -1,
        title: split.title,
        attributes: parseAttributes(split.metadata.slice(durationToken.length)),
        headers: {},
        directives: [],
      };
      continue;
    }
    if (line.toUpperCase().startsWith('#EXTGRP:') && pending) {
      pending.groupTitle = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }
    if (line.toUpperCase().startsWith('#EXTVLCOPT:') && pending) {
      const option = line.slice(line.indexOf(':') + 1);
      const equals = option.indexOf('=');
      if (equals > 0) addHeader(pending.headers, option.slice(0, equals), option.slice(equals + 1));
      continue;
    }
    if (line.toUpperCase().startsWith('#KODIPROP:') && pending) {
      const option = line.slice(line.indexOf(':') + 1);
      const equals = option.indexOf('=');
      if (equals > 0 && /(?:stream_headers|user-agent|referer)/i.test(option.slice(0, equals))) {
        parseHeaderPairs(option.slice(equals + 1), pending.headers);
      }
      continue;
    }
    if (line.toUpperCase().startsWith('#EXTHTTP:') && pending) {
      parseExtHttp(line.slice(line.indexOf(':') + 1), pending.headers);
      continue;
    }
    if (line.startsWith('#')) {
      if (pending) pending.directives.push(line);
      else if (!line.toUpperCase().startsWith('#EXTM3U')) extraDirectives.push(line);
      continue;
    }

    const entry = createEntry(
      pending ?? {
        duration: -1,
        title: '',
        attributes: {},
        headers: {},
        directives: [],
      },
      line,
      safeOptions,
    );
    pending = null;
    if (!entry) {
      warnings.push(`Entry at line ${lineIndex + 1} has an empty media URL`);
      continue;
    }
    let id = entry.id;
    let duplicateIndex = 2;
    while (seenIds.has(id)) id = `${entry.id}-${duplicateIndex++}`;
    seenIds.add(id);
    entries.push(id === entry.id ? entry : { ...entry, id });
  }

  if (pending) warnings.push('The final playlist entry has no media URL');
  if (entries.length === 0) throw new Error('This playlist does not contain any playable items.');

  return {
    name: playlistName,
    epgUrls,
    entries,
    warnings,
    extraHeaderAttributes:
      Object.keys(extraHeaderAttributes).length > 0 ? extraHeaderAttributes : undefined,
    extraDirectives: extraDirectives.length > 0 ? extraDirectives : undefined,
  };
}

function getM3uSeriesId(sourceId: string, seriesTitle: string): string {
  return `m3u-series-${fnv1a(`${sourceId}|${seriesTitle.trim().toLowerCase()}`)}`;
}

export function getM3uSeriesGroups(playlist: M3uPlaylist): Map<string, M3uEntry[]> {
  const groups = new Map<string, M3uEntry[]>();
  for (const entry of playlist.entries) {
    if (entry.type !== 'series') continue;
    const seriesTitle = entry.episode?.seriesTitle || entry.title;
    const id = getM3uSeriesId(entry.sourceId, seriesTitle);
    const list = groups.get(id);
    if (list) {
      list.push(entry);
    } else {
      groups.set(id, [entry]);
    }
  }
  for (const episodes of groups.values()) {
    episodes.sort((left, right) => {
      const seasonDifference =
        (left.episode?.seasonNumber ?? 0) - (right.episode?.seasonNumber ?? 0);
      return (
        seasonDifference || (left.episode?.episodeNumber ?? 0) - (right.episode?.episodeNumber ?? 0)
      );
    });
  }
  return groups;
}

export interface GenerateM3uOptions {
  name?: string | undefined;
  epgUrls?: string[] | undefined;
  entries: M3uEntry[];
  extraHeaderAttributes?: Record<string, string> | undefined;
  extraDirectives?: string[] | undefined;
  /** Set false when exporting a normalized playlist without vendor metadata. */
  preserveUnknownTags?: boolean | undefined;
}

function quotedAttribute(name: string, value: string): string {
  return `${name}="${value.replace(/[\r\n"]/g, "'")}"`;
}

export function generateM3u(playlist: GenerateM3uOptions): string {
  const lines: string[] = [];
  const preserveUnknownTags = playlist.preserveUnknownTags ?? true;

  const headerParts = ['#EXTM3U'];
  if (playlist.epgUrls && playlist.epgUrls.length > 0) {
    const epgValue = playlist.epgUrls.filter(Boolean).join(',');
    if (epgValue) {
      headerParts.push(`x-tvg-url="${epgValue}"`);
    }
  }
  if (playlist.name) {
    headerParts.push(quotedAttribute('playlist-name', playlist.name));
  }
  for (const [name, value] of Object.entries(
    preserveUnknownTags ? playlist.extraHeaderAttributes || {} : {},
  )) {
    if (!KNOWN_HEADER_ATTRIBUTES.has(name.toLowerCase()) && value)
      headerParts.push(quotedAttribute(name, value));
  }
  lines.push(headerParts.join(' '));
  if (preserveUnknownTags)
    lines.push(...(playlist.extraDirectives || []).filter((line) => line.startsWith('#')));

  for (const entry of playlist.entries) {
    const duration = Number.isFinite(entry.duration) ? entry.duration : -1;
    const attributes: string[] = [];

    if (entry.tvgId) attributes.push(quotedAttribute('tvg-id', entry.tvgId));
    if (entry.tvgName) attributes.push(quotedAttribute('tvg-name', entry.tvgName));
    if (entry.logo) attributes.push(quotedAttribute('tvg-logo', entry.logo));
    if (entry.channelNumber) attributes.push(quotedAttribute('tvg-chno', entry.channelNumber));
    if (entry.groupTitle) attributes.push(quotedAttribute('group-title', entry.groupTitle));
    if (entry.catchup) attributes.push(quotedAttribute('catchup', entry.catchup));
    if (entry.catchupDays !== undefined && Number.isFinite(entry.catchupDays)) {
      attributes.push(`catchup-days="${entry.catchupDays}"`);
    }
    if (entry.catchupSource)
      attributes.push(quotedAttribute('catchup-source', entry.catchupSource));
    if (entry.description) attributes.push(quotedAttribute('description', entry.description));
    if (entry.year) attributes.push(quotedAttribute('year', entry.year));
    if (entry.rating !== undefined && Number.isFinite(entry.rating)) {
      attributes.push(`rating="${entry.rating}"`);
    }
    if (entry.radio) attributes.push('radio="true"');
    attributes.push(quotedAttribute('movena-type', entry.type));
    for (const [name, value] of Object.entries(
      preserveUnknownTags ? entry.extraAttributes || {} : {},
    )) {
      if (!KNOWN_ENTRY_ATTRIBUTES.has(name.toLowerCase()) && value)
        attributes.push(quotedAttribute(name, value));
    }

    const attrString = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
    lines.push(`#EXTINF:${duration}${attrString},${entry.title || 'Untitled stream'}`);

    if (entry.groupTitle) {
      lines.push(`#EXTGRP:${entry.groupTitle}`);
    }

    if (preserveUnknownTags)
      lines.push(...(entry.extraDirectives || []).filter((line) => line.startsWith('#')));

    if (entry.headers && Object.keys(entry.headers).length > 0) {
      const extraHeaders: Record<string, string> = {};
      const inheritedHeaderNames = new Set(
        (entry.inheritedHeaderNames ?? []).map((name) => name.toLowerCase()),
      );
      for (const [key, value] of Object.entries(entry.headers)) {
        const canonical = key.toLowerCase();
        if (inheritedHeaderNames.has(canonical)) continue;
        if (canonical === 'user-agent') {
          lines.push(`#EXTVLCOPT:http-user-agent=${value}`);
        } else if (canonical === 'referer' || canonical === 'referrer') {
          lines.push(`#EXTVLCOPT:http-referrer=${value}`);
        } else {
          extraHeaders[key] = value;
        }
      }
      if (Object.keys(extraHeaders).length > 0)
        lines.push(`#EXTHTTP:${JSON.stringify(extraHeaders)}`);
    }

    lines.push(entry.url);
  }

  return lines.join('\n') + '\n';
}
