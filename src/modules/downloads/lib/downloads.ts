/** Pure download-manager domain rules. No filesystem, network, or native IPC is used here. */

export type { DownloadStatusEvent } from '@/platform/contracts';

export const DOWNLOAD_JOB_STATES = [
  'queued',
  'downloading',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;

type DownloadJobState = (typeof DOWNLOAD_JOB_STATES)[number];

interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  ratio: number | null;
  percent: number | null;
  indeterminate: boolean;
}

export interface DownloadJob {
  id: string;
  sourceUrl: string;
  headers?: Record<string, string> | undefined;
  filePath?: string | undefined;
  fileName: string;
  state: DownloadJobState;
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  attempts: number;
  maxAttempts: number;
  error?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

type DownloadJobAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'progress'; downloadedBytes: unknown; totalBytes?: unknown | undefined }
  | { type: 'complete'; totalBytes?: unknown | undefined }
  | { type: 'fail'; error: unknown }
  | { type: 'retry' }
  | { type: 'cancel'; reason?: unknown | undefined };

export interface CreateDownloadJobInput {
  id: unknown;
  sourceUrl: unknown;
  headers?: unknown | undefined;
  fileName?: unknown | undefined;
  maxAttempts?: unknown | undefined;
  totalBytes?: unknown | undefined;
  now?: unknown | undefined;
}

export interface FilenameOptions {
  fallback?: string | undefined;
  maxLength?: number | undefined;
}

const DEFAULT_FILE_NAME = 'download';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_FILENAME_LENGTH = 180;
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/g;
const WINDOWS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter(
      ([name, headerValue]) =>
        name.length > 0 &&
        name.length <= 128 &&
        typeof headerValue === 'string' &&
        headerValue.length <= 4096,
    )
    .slice(0, 16)
    .map(([name, headerValue]) => [name, headerValue as string] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { [Symbol.iterator]?: unknown | undefined })[Symbol.iterator] === 'function'
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(0, Math.floor(number));
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(1, Math.floor(number));
}

function safeTimestamp(value: unknown, fallback: number): number {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : fallback;
}

function safeError(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
  if (value instanceof Error && value.message.trim()) return value.message.trim().slice(0, 500);
  if (isRecord(value) && typeof value.message === 'string' && value.message.trim()) {
    return value.message.trim().slice(0, 500);
  }
  return undefined;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function splitFileName(fileName: string): { stem: string; extension: string } {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return { stem: fileName, extension: '' };
  return { stem: fileName.slice(0, lastDot), extension: fileName.slice(lastDot) };
}

function truncateFileName(fileName: string, maxLength: number): string {
  if (fileName.length <= maxLength) return fileName;
  const { stem, extension } = splitFileName(fileName);
  if (extension.length >= maxLength) return extension.slice(0, maxLength) || '_';
  const stemLength = Math.max(1, maxLength - extension.length);
  return (
    `${stem.slice(0, stemLength)}${extension}`.replace(TRAILING_DOTS_AND_SPACES, '') ||
    DEFAULT_FILE_NAME
  );
}

/** Converts arbitrary input into a portable, single-component filename. */
export function sanitizeDownloadFileName(value: unknown, options: FilenameOptions = {}): string {
  const fallback =
    typeof options.fallback === 'string' && options.fallback.trim()
      ? options.fallback.trim()
      : DEFAULT_FILE_NAME;
  const maxLength = positiveInteger(options.maxLength, DEFAULT_MAX_FILENAME_LENGTH);
  const raw = typeof value === 'string' ? value : '';
  let safe = raw
    .replace(INVALID_FILENAME_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_DOTS_AND_SPACES, '');

  if (!safe || safe === '.' || safe === '..') safe = fallback;
  if (WINDOWS_DEVICE_NAME.test(safe)) safe = `_${safe}`;

  safe = truncateFileName(safe, maxLength).replace(TRAILING_DOTS_AND_SPACES, '');
  return safe || DEFAULT_FILE_NAME;
}

function comparableFileName(value: unknown): string {
  return sanitizeDownloadFileName(value).normalize('NFKC').toLocaleLowerCase();
}

/** Returns a sanitized filename that avoids case-insensitive collisions. */
export function createCollisionSafeFileName(
  desiredName: unknown,
  existingNames: Iterable<unknown> | unknown = [],
  options: FilenameOptions = {},
): string {
  const baseName = sanitizeDownloadFileName(desiredName, options);
  const occupied = new Set<string>();
  if (isIterable(existingNames)) {
    for (const existingName of existingNames) occupied.add(comparableFileName(existingName));
  }

  if (!occupied.has(comparableFileName(baseName))) return baseName;
  const { stem, extension } = splitFileName(baseName);
  for (let suffix = 1; suffix <= 100_000; suffix += 1) {
    const candidate = sanitizeDownloadFileName(`${stem} (${suffix})${extension}`, options);
    if (!occupied.has(comparableFileName(candidate))) return candidate;
  }
  return sanitizeDownloadFileName(`${stem}-${Date.now()}${extension}`, options);
}

/** Normalizes byte counts to a safe bounded progress value. */
export function normalizeDownloadProgress(
  downloadedBytes: unknown,
  totalBytes: unknown,
): DownloadProgress {
  const downloaded = nonNegativeInteger(downloadedBytes);
  const rawTotal = finiteNumber(totalBytes);
  const total = rawTotal !== null && rawTotal > 0 ? Math.floor(rawTotal) : null;

  if (total === null) {
    return {
      downloadedBytes: downloaded,
      totalBytes: null,
      ratio: null,
      percent: null,
      indeterminate: true,
    };
  }

  const boundedDownloaded = Math.min(downloaded, total);
  const ratio = clampRatio(boundedDownloaded / total);
  return {
    downloadedBytes: boundedDownloaded,
    totalBytes: total,
    ratio,
    percent: Math.round(ratio * 100),
    indeterminate: false,
  };
}

function isDownloadJobState(value: unknown): value is DownloadJobState {
  return typeof value === 'string' && (DOWNLOAD_JOB_STATES as readonly string[]).includes(value);
}

/**
 * Validates and repairs persisted job data. Invalid required identity fields return null;
 * optional counters, timestamps, names, and states are safely normalized.
 */
export function normalizeDownloadJob(input: unknown, now = Date.now()): DownloadJob | null {
  if (!isRecord(input)) return null;

  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  if (!id || !sourceUrl) return null;

  const safeNow = safeTimestamp(now, Date.now());
  const maxAttempts = positiveInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const attempts = Math.min(nonNegativeInteger(input.attempts), maxAttempts);
  const rawTotal = finiteNumber(input.totalBytes);
  const totalBytes = rawTotal !== null && rawTotal > 0 ? Math.floor(rawTotal) : null;
  const progress = normalizeDownloadProgress(input.downloadedBytes, totalBytes);
  const state = isDownloadJobState(input.state)
    ? input.state
    : isDownloadJobState(input.status)
      ? input.status
      : 'queued';
  const createdAt = safeTimestamp(input.createdAt, safeNow);
  const updatedAt = safeTimestamp(input.updatedAt, createdAt);
  const error = safeError(input.error);

  return {
    id,
    sourceUrl,
    ...(safeHeaders(input.headers) ? { headers: safeHeaders(input.headers) } : {}),
    ...(typeof input.filePath === 'string' && input.filePath.trim()
      ? { filePath: input.filePath.trim() }
      : {}),
    fileName: sanitizeDownloadFileName(input.fileName),
    state,
    progress: state === 'completed' ? 1 : progress.ratio,
    downloadedBytes:
      state === 'completed' && totalBytes !== null ? totalBytes : progress.downloadedBytes,
    totalBytes,
    attempts,
    maxAttempts,
    ...(error ? { error } : {}),
    createdAt,
    updatedAt,
  };
}

/** Creates a queued job, or null when required input is malformed. */
export function createDownloadJob(input: CreateDownloadJobInput | unknown): DownloadJob | null {
  return normalizeDownloadJob(
    {
      ...(isRecord(input) ? input : {}),
      state: 'queued',
      attempts: 0,
      downloadedBytes: 0,
      now: isRecord(input) ? input.now : undefined,
    },
    isRecord(input) ? safeTimestamp(input.now, Date.now()) : Date.now(),
  );
}

function withUpdatedAt(job: DownloadJob, now: number): DownloadJob {
  return { ...job, updatedAt: safeTimestamp(now, job.updatedAt) };
}

function isAction(value: unknown): value is DownloadJobAction {
  return isRecord(value) && typeof value.type === 'string';
}

export function canTransitionDownloadJob(
  state: DownloadJobState,
  action: DownloadJobAction['type'],
): boolean {
  switch (action) {
    case 'start':
      return state === 'queued';
    case 'pause':
      return state === 'downloading';
    case 'resume':
      return state === 'paused';
    case 'progress':
      return state === 'downloading';
    case 'complete':
      return state === 'downloading';
    case 'fail':
      return state === 'downloading';
    case 'retry':
      return state === 'failed' || state === 'cancelled';
    case 'cancel':
      return state === 'queued' || state === 'downloading' || state === 'paused';
    default:
      return false;
  }
}

/** Applies only legal state transitions; malformed jobs/actions return null. */
export function transitionDownloadJob(
  inputJob: unknown,
  inputAction: unknown,
  now = Date.now(),
): DownloadJob | null {
  const job = normalizeDownloadJob(inputJob, now);
  if (
    !job ||
    !isAction(inputAction) ||
    !canTransitionDownloadJob(job.state, inputAction.type as DownloadJobAction['type'])
  ) {
    return job;
  }

  const action = inputAction as DownloadJobAction;
  const updatedAt = safeTimestamp(now, job.updatedAt);

  switch (action.type) {
    case 'start':
      if (job.attempts >= job.maxAttempts) return job;
      return withUpdatedAt(
        { ...job, state: 'downloading', attempts: job.attempts + 1, error: undefined },
        updatedAt,
      );
    case 'pause':
      return withUpdatedAt({ ...job, state: 'paused' }, updatedAt);
    case 'resume':
      return withUpdatedAt({ ...job, state: 'downloading' }, updatedAt);
    case 'progress': {
      const progress = normalizeDownloadProgress(
        action.downloadedBytes,
        action.totalBytes ?? job.totalBytes,
      );
      return withUpdatedAt(
        {
          ...job,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          progress: progress.ratio,
          error: undefined,
        },
        updatedAt,
      );
    }
    case 'complete': {
      const progress = normalizeDownloadProgress(
        action.totalBytes ?? job.totalBytes ?? job.downloadedBytes,
        action.totalBytes ?? job.totalBytes,
      );
      return withUpdatedAt(
        {
          ...job,
          state: 'completed',
          downloadedBytes: progress.totalBytes ?? progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          progress: 1,
          error: undefined,
        },
        updatedAt,
      );
    }
    case 'fail':
      return withUpdatedAt(
        { ...job, state: 'failed', error: safeError(action.error) || 'Download failed' },
        updatedAt,
      );
    case 'retry':
      if (job.attempts >= job.maxAttempts) return job;
      return withUpdatedAt(
        {
          ...job,
          state: 'queued',
          progress: 0,
          downloadedBytes: 0,
          totalBytes: null,
          error: undefined,
        },
        updatedAt,
      );
    case 'cancel':
      return withUpdatedAt(
        { ...job, state: 'cancelled', error: safeError(action.reason) },
        updatedAt,
      );
    default:
      return job;
  }
}

export function updateDownloadProgress(
  job: DownloadJob,
  downloadedBytes: unknown,
  totalBytes?: unknown,
  now = Date.now(),
): DownloadJob | null {
  return transitionDownloadJob(
    job,
    {
      type: 'progress',
      downloadedBytes,
      totalBytes: totalBytes ?? job.totalBytes,
    },
    now,
  );
}

export function retryDownloadJob(job: DownloadJob, now = Date.now()): DownloadJob | null {
  return transitionDownloadJob(job, { type: 'retry' }, now);
}

export function cancelDownloadJob(
  job: DownloadJob,
  reason?: unknown,
  now = Date.now(),
): DownloadJob | null {
  return transitionDownloadJob(job, { type: 'cancel', reason }, now);
}

/**
 * A completed download's permanent catalog snapshot: enough metadata to
 * render and play the file with zero network/provider access. Persisted
 * indefinitely (unlike `DownloadJob`), so — like the job it came from — it
 * must never carry provider headers or an unresolved remote `sourceUrl`.
 */
export interface DownloadedItem {
  /** Same library id used for favorites/history/watched, so lookups line up. */
  id: string;
  jobId: string;
  filePath: string;
  fileName: string;
  type: 'vod' | 'series';
  title: string;
  posterUrl?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  country?: string | null | undefined;
  sizeBytes: number;
  downloadedAt: number;
  // Series linkage — undefined for movies.
  seriesId?: string | undefined;
  seriesSourceItemId?: string | undefined;
  seriesTitle?: string | undefined;
  seriesPosterUrl?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
  episodeTitle?: string | undefined;
}

const MAX_TEXT_LENGTH = 500;
const MAX_TAGS = 16;

function safeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function safeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, MAX_TAGS)
    .map((entry) => entry.trim().slice(0, 64));
  return entries.length > 0 ? entries : undefined;
}

function safeSeasonOrEpisodeNum(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = safeText(value, 32);
  return text;
}

function isDownloadedMediaType(value: unknown): value is DownloadedItem['type'] {
  return value === 'vod' || value === 'series';
}

/**
 * Validates and repairs a persisted downloaded-item record. Required
 * identity/playback fields missing or malformed return null; everything
 * else is safely normalized or dropped.
 */
export function normalizeDownloadedItem(input: unknown): DownloadedItem | null {
  if (!isRecord(input)) return null;

  const id = safeText(input.id, 200);
  const jobId = safeText(input.jobId, 200);
  const filePath = safeText(input.filePath, 4096);
  const fileName = safeText(input.fileName);
  const title = safeText(input.title);
  const type = isDownloadedMediaType(input.type) ? input.type : null;
  if (!id || !jobId || !filePath || !fileName || !title || !type) return null;

  const sizeBytes = nonNegativeInteger(input.sizeBytes);
  const downloadedAt = safeTimestamp(input.downloadedAt, Date.now());

  return {
    id,
    jobId,
    filePath,
    fileName: sanitizeDownloadFileName(fileName),
    type,
    title,
    ...(safeText(input.posterUrl, 2048) ? { posterUrl: safeText(input.posterUrl, 2048) } : {}),
    ...(safeText(input.description, 2000)
      ? { description: safeText(input.description, 2000) }
      : {}),
    ...(safeStringArray(input.tags) ? { tags: safeStringArray(input.tags) } : {}),
    ...(input.country === null
      ? { country: null }
      : safeText(input.country, 100)
        ? { country: safeText(input.country, 100) }
        : {}),
    sizeBytes,
    downloadedAt,
    ...(safeText(input.seriesId, 200) ? { seriesId: safeText(input.seriesId, 200) } : {}),
    ...(safeText(input.seriesSourceItemId, 200)
      ? { seriesSourceItemId: safeText(input.seriesSourceItemId, 200) }
      : {}),
    ...(safeText(input.seriesTitle) ? { seriesTitle: safeText(input.seriesTitle) } : {}),
    ...(safeText(input.seriesPosterUrl, 2048)
      ? { seriesPosterUrl: safeText(input.seriesPosterUrl, 2048) }
      : {}),
    ...(safeSeasonOrEpisodeNum(input.seasonNum) !== undefined
      ? { seasonNum: safeSeasonOrEpisodeNum(input.seasonNum) }
      : {}),
    ...(safeSeasonOrEpisodeNum(input.episodeNum) !== undefined
      ? { episodeNum: safeSeasonOrEpisodeNum(input.episodeNum) }
      : {}),
    ...(safeText(input.episodeTitle) ? { episodeTitle: safeText(input.episodeTitle) } : {}),
  };
}

/** The catalog snapshot captured *before* a download completes — everything a `DownloadedItem` needs except transport/completion facts only the finished job can supply. */
export type DownloadItemMetadata = Omit<
  DownloadedItem,
  'jobId' | 'filePath' | 'fileName' | 'sizeBytes' | 'downloadedAt'
>;

/** Normalizes a whole persisted map, dropping any record that fails validation. */
export function normalizeDownloadedItems(input: unknown): Record<string, DownloadedItem> {
  if (!isRecord(input)) return {};
  const result: Record<string, DownloadedItem> = {};
  for (const [key, value] of Object.entries(input)) {
    const item = normalizeDownloadedItem(value);
    if (item && item.id === key) result[key] = item;
  }
  return result;
}

export interface DownloadedSeriesGroup {
  /** The series' own library id when known, else a per-item fallback so an
   *  episode downloaded without series linkage still gets its own tile. */
  seriesId: string;
  seriesTitle: string;
  seriesPosterUrl?: string | undefined;
  episodes: DownloadedItem[];
  latestDownloadedAt: number;
}

/** Groups downloaded episodes by series, newest download first. */
export function groupDownloadedSeries(items: Iterable<DownloadedItem>): DownloadedSeriesGroup[] {
  const groups = new Map<string, DownloadedSeriesGroup>();
  for (const item of items) {
    if (item.type !== 'series') continue;
    const key = item.seriesId || item.id;
    const existing = groups.get(key);
    if (existing) {
      existing.episodes.push(item);
      existing.latestDownloadedAt = Math.max(existing.latestDownloadedAt, item.downloadedAt);
      if (!existing.seriesPosterUrl && item.seriesPosterUrl)
        existing.seriesPosterUrl = item.seriesPosterUrl;
    } else {
      groups.set(key, {
        seriesId: key,
        seriesTitle: item.seriesTitle || item.title,
        seriesPosterUrl: item.seriesPosterUrl || item.posterUrl,
        episodes: [item],
        latestDownloadedAt: item.downloadedAt,
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.latestDownloadedAt - a.latestDownloadedAt);
}
