import type { M3uEntry } from '@/modules/sources/public/data/m3uClient';
import type { XtreamCredentials } from '@/modules/sources/public/model/xtream';
import type { XtreamLiveStream } from '@/modules/sources/public/data/xtreamClient';

/** Values accepted by the catch-up helpers. Numeric Unix values may be seconds or milliseconds. */
export type CatchupTime = number | string | Date;

export type M3uCatchupMode =
  'none' | 'shift' | 'default' | 'append' | 'flussonic' | 'xc' | 'source';

export interface CatchupProgramme {
  start?: CatchupTime | undefined;
  end?: CatchupTime | undefined;
  startTimestamp?: CatchupTime | undefined;
  stopTimestamp?: CatchupTime | undefined;
  endTimestamp?: CatchupTime | undefined;
}

export interface CatchupWindowOptions {
  now?: CatchupTime | undefined;
  /** When true, a programme must have an end time in the past. */
  requireEnded?: boolean | undefined;
}

export interface CatchupWindow {
  eligible: boolean;
  start: number | null;
  end: number | null;
  now: number;
  archiveDays: number;
  reason:
    | 'eligible'
    | 'missing-start'
    | 'invalid-archive-days'
    | 'future'
    | 'outside-window'
    | 'not-ended';
}

export interface XtreamCatchupOptions {
  extension?: string | undefined;
  now?: CatchupTime | undefined;
  requireEnded?: boolean | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const XMLTV_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOffset(
  sign: string | undefined,
  hours: string | undefined,
  minutes: string | undefined,
): number {
  if (!sign || !hours || !minutes) return 0;
  const hourValue = Number(hours);
  const minuteValue = Number(minutes);
  if (hourValue > 23 || minuteValue > 59) return Number.NaN;
  const total = hourValue * 60 + minuteValue;
  return sign === '-' ? -total : total;
}

function validCalendarDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function parseXmltvTimestamp(value: string): number | null {
  const match = XMLTV_TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    sign,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? '0');
  if (!validCalendarDate(year, month, day, hour, minute, second)) return null;
  const offsetMinutes = parseOffset(sign, offsetHour, offsetMinute);
  if (!Number.isFinite(offsetMinutes)) return null;
  return Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
}

function parseIsoTimestamp(value: string): number | null {
  const match = ISO_TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText ?? '0');
  const minute = Number(minuteText ?? '0');
  const second = Number(secondText ?? '0');
  if (!validCalendarDate(year, month, day, hour, minute, second)) return null;

  const fraction = fractionText ? Number(`0.${fractionText}`) * 1000 : 0;
  if (!zone) {
    // Date-only and timezone-less timestamps follow the same local-time convention as XMLTV.
    const local = new Date(year, month - 1, day, hour, minute, second, fraction);
    return Number.isFinite(local.getTime()) ? local.getTime() : null;
  }
  if (zone === 'Z') return Date.UTC(year, month - 1, day, hour, minute, second, fraction);
  const zoneMatch = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
  if (!zoneMatch) return null;
  const offsetMinutes = parseOffset(zoneMatch[1], zoneMatch[2], zoneMatch[3]);
  return Number.isFinite(offsetMinutes)
    ? Date.UTC(year, month - 1, day, hour, minute, second, fraction) - offsetMinutes * 60_000
    : null;
}

/** Parse XMLTV, ISO-8601, Date, or Unix-second/millisecond timestamps to milliseconds. */
export function parseCatchupTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) && time > 0 ? time : null;
  }
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && /^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(value))
  ) {
    const numeric = finitePositive(value);
    if (numeric === null) return null;
    const milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  return parseXmltvTimestamp(trimmed) ?? parseIsoTimestamp(trimmed);
}

function programmeStart(programme: CatchupProgramme | null | undefined): number | null {
  if (!programme) return null;
  return parseCatchupTimestamp(programme.startTimestamp ?? programme.start);
}

function programmeEnd(programme: CatchupProgramme | null | undefined): number | null {
  if (!programme) return null;
  return parseCatchupTimestamp(programme.stopTimestamp ?? programme.endTimestamp ?? programme.end);
}

function normalizedNow(value?: CatchupTime): number {
  return parseCatchupTimestamp(value ?? Date.now()) ?? Date.now();
}

function archiveDays(value: unknown): number | null {
  const parsed = finitePositive(value);
  return parsed === null ? null : parsed;
}

export function isWithinCatchupWindow(
  start: CatchupTime | null | undefined,
  archiveDaysValue: number | string | null | undefined,
  now: CatchupTime = Date.now(),
): boolean {
  const startMillis = parseCatchupTimestamp(start);
  const days = archiveDays(archiveDaysValue);
  const nowMillis = normalizedNow(now);
  return (
    startMillis !== null &&
    days !== null &&
    startMillis <= nowMillis &&
    nowMillis - startMillis <= days * DAY_MS
  );
}

export function evaluateCatchupWindow(
  programme: CatchupProgramme | null | undefined,
  archiveDaysValue: number | string | null | undefined,
  options: CatchupWindowOptions = {},
): CatchupWindow {
  const start = programmeStart(programme);
  const end = programmeEnd(programme);
  const now = normalizedNow(options.now);
  const days = archiveDays(archiveDaysValue);
  if (start === null)
    return { eligible: false, start, end, now, archiveDays: 0, reason: 'missing-start' };
  if (days === null)
    return { eligible: false, start, end, now, archiveDays: 0, reason: 'invalid-archive-days' };
  if (start > now) return { eligible: false, start, end, now, archiveDays: days, reason: 'future' };
  if (now - start > days * DAY_MS)
    return { eligible: false, start, end, now, archiveDays: days, reason: 'outside-window' };
  if (options.requireEnded && (end === null || end > now)) {
    return { eligible: false, start, end, now, archiveDays: days, reason: 'not-ended' };
  }
  return { eligible: true, start, end, now, archiveDays: days, reason: 'eligible' };
}

function isCatchupProgrammeEligible(
  programme: CatchupProgramme | null | undefined,
  archiveDaysValue: number | string | null | undefined,
  options: CatchupWindowOptions = {},
): boolean {
  return evaluateCatchupWindow(programme, archiveDaysValue, options).eligible;
}

function cleanMode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isHttpUrl(value: string, base?: string): boolean {
  try {
    const parsed = new URL(value, base);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.username &&
      !parsed.password &&
      !/[\u0000-\u0020\u007f]/.test(value)
    );
  } catch {
    return false;
  }
}

function safeUrl(value: string, base?: string): URL | null {
  if (!value.trim() || !isHttpUrl(value, base)) return null;
  try {
    const parsed = new URL(value, base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function getM3uArchiveDays(entry: Pick<M3uEntry, 'catchupDays'> | null | undefined): number {
  return archiveDays(entry?.catchupDays) ?? 0;
}

export function getM3uCatchupMode(
  entry: Pick<M3uEntry, 'url' | 'catchup' | 'catchupSource' | 'catchupDays'> | null | undefined,
): M3uCatchupMode {
  if (getM3uArchiveDays(entry) <= 0 || !entry) return 'none';
  const mode = cleanMode(entry.catchup);
  const source = typeof entry.catchupSource === 'string' ? entry.catchupSource.trim() : '';
  const hasSource = Boolean(source) && isHttpUrl(source, entry.url);
  const hasStream = typeof entry.url === 'string' && isHttpUrl(entry.url);
  if (mode === 'none' || mode === 'disabled') return 'none';
  if (mode === 'flussonic') return hasSource || hasStream ? 'flussonic' : 'none';
  if (mode === 'xc' || mode === 'xtream') return hasSource || hasStream ? 'xc' : 'none';
  if (mode === 'append') return hasSource || hasStream ? 'append' : 'none';
  if (mode === 'shift' || !mode) return hasStream ? 'shift' : 'none';
  if (mode === 'default') return hasSource ? 'default' : 'none';
  return hasSource ? 'source' : 'none';
}

export function isM3uCatchupPlaybackSupported(
  entry: Pick<M3uEntry, 'url' | 'catchup' | 'catchupSource' | 'catchupDays'> | null | undefined,
): boolean {
  return getM3uCatchupMode(entry) !== 'none';
}

interface TemplateValues {
  start: number;
  end: number;
  now: number;
  duration: number;
  offset: number;
}

function utcParts(seconds: number): Record<string, string> {
  const date = new Date(seconds * 1000);
  return {
    Y: String(date.getUTCFullYear()).padStart(4, '0'),
    m: String(date.getUTCMonth() + 1).padStart(2, '0'),
    d: String(date.getUTCDate()).padStart(2, '0'),
    H: String(date.getUTCHours()).padStart(2, '0'),
    M: String(date.getUTCMinutes()).padStart(2, '0'),
    S: String(date.getUTCSeconds()).padStart(2, '0'),
  };
}

function formatTemplateTimestamp(seconds: number, format?: string): string {
  if (!format) return String(seconds);
  const parts = utcParts(seconds);
  return format.replace(/[YmdHMS]/g, (token) => parts[token] ?? token);
}

function substituteTemplate(template: string, values: TemplateValues): string {
  const parts = utcParts(values.start);
  const startTokens: Record<string, string> = {
    start: String(values.start),
    utc: String(values.start),
    timestamp: String(values.start),
    end: String(values.end),
    utcend: String(values.end),
    lutc: String(values.now),
    duration: String(values.duration),
    offset: String(values.offset),
    catchupid: String(values.start),
  };
  return template.replace(
    /\$?\{(start|end|utc|utcend|lutc|timestamp|duration|offset|catchup-id|catchupid)(?::([^}]+))?\}|\{([YmdHMS])\}/gi,
    (_match: string, token: string, format: string | undefined, dateToken: string | undefined) => {
      if (dateToken) return parts[dateToken] ?? dateToken;
      const key = (token ?? '').toLowerCase().replace('-', '');
      return formatTemplateTimestamp(Number(startTokens[key] ?? values.start), format);
    },
  );
}

function programmeValues(programme: CatchupProgramme, now: CatchupTime): TemplateValues | null {
  const start = programmeStart(programme);
  if (start === null) return null;
  const nowMillis = normalizedNow(now);
  const end = programmeEnd(programme) ?? nowMillis;
  const startSeconds = Math.floor(start / 1000);
  const endSeconds = Math.max(startSeconds, Math.floor(end / 1000));
  return {
    start: startSeconds,
    end: endSeconds,
    now: Math.floor(nowMillis / 1000),
    duration: Math.max(0, endSeconds - startSeconds),
    offset: Math.max(0, Math.floor((nowMillis - start) / 1000)),
  };
}

function appendCatchupParameters(rawUrl: string, values: TemplateValues): string | null {
  const url = safeUrl(rawUrl);
  if (!url) return null;
  url.searchParams.set('utc', String(values.start));
  url.searchParams.set('lutc', String(values.now));
  return url.toString();
}

function appendM3uSource(entryUrl: string, source: string, values: TemplateValues): string | null {
  const trimmed = source.trim();
  if (/^[?&]/.test(trimmed)) {
    const base = safeUrl(entryUrl);
    if (!base) return null;
    const query = substituteTemplate(trimmed.replace(/^[?&]/, ''), values);
    const params = new URLSearchParams(query);
    params.forEach((value, key) => base.searchParams.set(key, value));
    return base.toString();
  }
  return null;
}

/** Resolve an M3U catch-up URL, including standard timestamp and date placeholders. */
export function resolveM3uCatchupUrl(
  entry: Pick<M3uEntry, 'url' | 'catchup' | 'catchupSource' | 'catchupDays'> | null | undefined,
  programme: CatchupProgramme | null | undefined,
  now: CatchupTime = Date.now(),
  options: Pick<CatchupWindowOptions, 'requireEnded'> = {},
): string | null {
  if (!entry || !programme) return null;
  const window = evaluateCatchupWindow(programme, entry.catchupDays, {
    now,
    requireEnded: options.requireEnded,
  });
  if (!window.eligible) return null;
  const mode = getM3uCatchupMode(entry);
  if (mode === 'none') return null;
  const values = programmeValues(programme, now);
  if (!values) return null;
  if (
    mode === 'append' &&
    entry.catchupSource &&
    !/^https?:\/\//i.test(entry.catchupSource.trim())
  ) {
    return (
      appendM3uSource(entry.url, entry.catchupSource, values) ??
      appendCatchupParameters(entry.url, values)
    );
  }
  const rawSource = mode === 'shift' ? entry.url : entry.catchupSource || entry.url;
  if (!rawSource || !isHttpUrl(rawSource, entry.url)) return null;
  const resolvedSource = safeUrl(rawSource, entry.url);
  if (!resolvedSource) return null;
  const hasTemplate =
    /\$?\{(?:start|end|utc|utcend|lutc|timestamp|duration|offset|catchup-id)(?::[^}]+)?\}|\{[YmdHMS]\}/i.test(
      rawSource,
    );
  if (hasTemplate) {
    // Keep the template spelling intact until substitution; URL serialisation
    // percent-encodes braces and dollar signs in path segments.
    const templateSource = /^https?:\/\//i.test(rawSource.trim())
      ? rawSource.trim()
      : resolvedSource.toString();
    const resolved = substituteTemplate(templateSource, values);
    return safeUrl(resolved)?.toString() ?? null;
  }
  return mode === 'shift' || mode === 'append'
    ? appendCatchupParameters(resolvedSource.toString(), values)
    : resolvedSource.toString();
}

function getXtreamArchiveDays(
  stream: Pick<XtreamLiveStream, 'tv_archive_duration'> | null | undefined,
): number {
  return archiveDays(stream?.tv_archive_duration) ?? 0;
}

export function isXtreamCatchupSupported(
  stream: Pick<XtreamLiveStream, 'tv_archive' | 'tv_archive_duration'> | null | undefined,
): boolean {
  return Boolean(stream && Number(stream.tv_archive) === 1 && getXtreamArchiveDays(stream) > 0);
}

export function isXtreamCatchupProgrammeEligible(
  stream: Pick<XtreamLiveStream, 'tv_archive' | 'tv_archive_duration'> | null | undefined,
  programme: CatchupProgramme | null | undefined,
  options: CatchupWindowOptions = {},
): boolean {
  return (
    isXtreamCatchupSupported(stream) &&
    isCatchupProgrammeEligible(programme, getXtreamArchiveDays(stream), options)
  );
}

function safeExtension(value: string | undefined): string {
  const cleaned = (value || 'ts').trim().replace(/^\.+/, '').toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(cleaned) ? cleaned : 'ts';
}

function safePathSegment(value: string): string | null {
  const cleaned = value.trim();
  return cleaned && !/[\u0000-\u001f\u007f/\\?#]/.test(cleaned)
    ? encodeURIComponent(cleaned)
    : null;
}

/** Build the conventional Xtream timeshift URL for an eligible programme. */
export function buildXtreamCatchupUrl(
  credentials: Pick<XtreamCredentials, 'url' | 'username' | 'password'> | null | undefined,
  streamId: string | number,
  programme: CatchupProgramme | null | undefined,
  options: XtreamCatchupOptions = {},
): string | null {
  if (!credentials || !programme) return null;
  const base = safeUrl(credentials.url);
  const username = safePathSegment(credentials.username);
  const password = safePathSegment(credentials.password);
  const id = safePathSegment(String(streamId));
  const values = programmeValues(programme, options.now ?? Date.now());
  if (!base || !username || !password || !id || !values) return null;
  const durationMinutes = Math.max(1, Math.ceil(values.duration / 60));
  const startDate = new Date(values.start * 1000);
  const start = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}:${String(startDate.getUTCHours()).padStart(2, '0')}-${String(startDate.getUTCMinutes()).padStart(2, '0')}`;
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/timeshift/${username}/${password}/${durationMinutes}/${start}/${id}.${safeExtension(options.extension)}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export function resolveXtreamCatchupUrl(
  stream:
    Pick<XtreamLiveStream, 'stream_id' | 'tv_archive' | 'tv_archive_duration'> | null | undefined,
  credentials: Pick<XtreamCredentials, 'url' | 'username' | 'password'> | null | undefined,
  programme: CatchupProgramme | null | undefined,
  options: XtreamCatchupOptions = {},
): string | null {
  if (!stream || !isXtreamCatchupProgrammeEligible(stream, programme, options)) return null;
  return buildXtreamCatchupUrl(credentials, stream.stream_id, programme, options);
}
