import { tauriApi } from '@/platform/tauri';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { useDownloadStore } from '../store/useDownloadStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { sanitizeDownloadFileName, type DownloadItemMetadata } from '../lib/downloads';

export interface DownloadableMediaItem {
  /** Library id (favorites/history/watched id). Required to ever appear as a playable download later. */
  id?: string;
  title: string;
  type?: 'live' | 'vod' | 'series' | undefined;
  streamUrl?: string | undefined;
  httpHeaders?: Record<string, string> | undefined;
  containerExtension?: string | undefined;
  posterUrl?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  country?: string | null | undefined;
  // Series linkage — present when this item is an episode.
  seriesId?: string | undefined;
  seriesSourceItemId?: string | undefined;
  seriesTitle?: string | undefined;
  seriesPosterUrl?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
  episodeTitle?: string | undefined;
}

export interface MediaDownloadRequest {
  url: string;
  fileName: string;
  headers?: Record<string, string> | undefined;
  id?: string | undefined;
  force?: boolean | undefined;
  /** Catalog snapshot to persist once this download completes — see `useDownloadEvents`. */
  metadata?: DownloadItemMetadata | undefined;
}

/**
 * Metadata captured at enqueue time, keyed by the *transport* job id (not the
 * library id — job ids must satisfy Rust's `valid_download_id`, which rejects
 * the colons a library id like `sourceId:episode:123` contains). Consumed
 * once the job reaches `completed` (see `useDownloadEvents.ts`).
 *
 * A retry re-enqueues the same job id without repassing metadata, so entries
 * are only ever added, never overwritten with nothing — and only ever read
 * once. Entries for a download that's abandoned instead of retried or
 * completed just sit here for the rest of the session; downloads are a
 * human-paced, manually-triggered action, so that's session-bounded and
 * small, not worth cross-module cleanup wiring.
 */
const pendingMetadata = new Map<string, DownloadItemMetadata>();

/** Consumes (reads and clears) the metadata stashed for a completed job. */
export function takePendingDownloadMetadata(jobId: string): DownloadItemMetadata | undefined {
  const metadata = pendingMetadata.get(jobId);
  pendingMetadata.delete(jobId);
  return metadata;
}

function buildPendingMetadata(item: DownloadableMediaItem): DownloadItemMetadata | undefined {
  if (!item.id || (item.type !== 'vod' && item.type !== 'series')) return undefined;
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    ...(item.posterUrl ? { posterUrl: item.posterUrl } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.tags && item.tags.length > 0 ? { tags: item.tags } : {}),
    ...(item.country !== undefined ? { country: item.country } : {}),
    ...(item.seriesId ? { seriesId: item.seriesId } : {}),
    ...(item.seriesSourceItemId ? { seriesSourceItemId: item.seriesSourceItemId } : {}),
    ...(item.seriesTitle ? { seriesTitle: item.seriesTitle } : {}),
    ...(item.seriesPosterUrl ? { seriesPosterUrl: item.seriesPosterUrl } : {}),
    ...(item.seasonNum !== undefined ? { seasonNum: item.seasonNum } : {}),
    ...(item.episodeNum !== undefined ? { episodeNum: item.episodeNum } : {}),
    ...(item.episodeTitle ? { episodeTitle: item.episodeTitle } : {}),
  };
}

/** Builds the consistent file name and transport details for catalogue media. */
export function downloadMediaItem(item: DownloadableMediaItem): Promise<string | null> {
  const extension = (item.containerExtension || 'mp4').replace(/^\./, '').trim() || 'mp4';
  return startMediaDownload({
    url: item.streamUrl || '',
    fileName: sanitizeDownloadFileName(`${item.title}.${extension}`),
    headers: item.httpHeaders,
    metadata: buildPendingMetadata(item),
  });
}

/**
 * Queues every not-yet-downloaded episode of a season. Episodes already in
 * `downloadedByLibraryId` are skipped so re-running this after downloading a
 * few new episodes doesn't re-fetch the whole season.
 */
export function downloadSeriesSeason(seasonLabel: string, episodes: DownloadableMediaItem[]): void {
  const downloaded = useDownloadStore.getState().downloadedByLibraryId;
  let queued = 0;
  for (const episode of episodes) {
    if (episode.id && downloaded[episode.id]) continue;
    if (!episode.streamUrl) continue;
    void downloadMediaItem(episode);
    queued += 1;
  }
  if (queued > 0) {
    notify.info(
      'Download Started',
      `${queued} episode${queued === 1 ? '' : 's'} from ${seasonLabel} queued for download.`,
      undefined,
      undefined,
      'downloads',
    );
  } else {
    notify.info(
      'Nothing to Download',
      `Every downloadable episode in ${seasonLabel} is already saved.`,
      undefined,
      undefined,
      'downloads',
    );
  }
}

/**
 * Deletes a completed download's file from disk and forgets its catalog
 * entry. Unlike the ephemeral job list's "Remove from list" (which never
 * touched the file), this actually frees the space.
 */
export async function deleteDownloadedItem(id: string): Promise<boolean> {
  const item = useDownloadStore.getState().downloadedByLibraryId[id];
  if (!item) return false;
  const settings = useSettingsStore.getState();
  try {
    await tauriApi.downloadMediaDelete({
      path: item.filePath,
      directory: settings.downloadDirectory || undefined,
    });
    useDownloadStore.getState().removeDownloadedItem(id);
    notify.success(
      'Download Removed',
      `${item.title} was deleted from your device.`,
      undefined,
      undefined,
      'downloads',
    );
    return true;
  } catch (error: unknown) {
    notify.error(
      'Could Not Remove Download',
      getUserFacingErrorMessage(error, 'The file could not be deleted.'),
      undefined,
      undefined,
      'downloads',
    );
    return false;
  }
}

function createDownloadId() {
  return `download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Starts one native media download and mirrors its lifecycle in the download store. */
export async function startMediaDownload(request: MediaDownloadRequest): Promise<string | null> {
  const url = request.url.trim();
  if (!url) {
    notify.warning(
      'Download Unavailable',
      'This media does not have a downloadable source URL.',
      undefined,
      undefined,
      'downloads',
    );
    return null;
  }

  const store = useDownloadStore.getState();
  const duplicate = request.id
    ? undefined
    : store.jobs.find(
        (job) =>
          job.sourceUrl === url &&
          job.fileName === request.fileName &&
          ['queued', 'downloading', 'paused'].includes(job.state),
      );
  if (duplicate) {
    notify.info(
      'Download Already Queued',
      `${request.fileName} is already in Downloads.`,
      undefined,
      undefined,
      'downloads',
    );
    return null;
  }
  const id = request.id ?? createDownloadId();
  if (request.metadata) pendingMetadata.set(id, request.metadata);
  if (!store.jobs.some((job) => job.id === id)) {
    store.enqueue({ id, sourceUrl: url, headers: request.headers, fileName: request.fileName });
  }

  const settings = useSettingsStore.getState();
  const activeCount = useDownloadStore
    .getState()
    .jobs.filter((job) => job.state === 'downloading').length;
  if (activeCount >= settings.maxConcurrentDownloads) {
    notify.info(
      'Download Queued',
      `${request.fileName} will start when a download slot is available.`,
      undefined,
      undefined,
      'downloads',
    );
    return null;
  }
  if (!request.force && !settings.autoStartDownloads) {
    notify.info(
      'Download Queued',
      `${request.fileName} will start when you choose Start.`,
      undefined,
      undefined,
      'downloads',
    );
    return null;
  }

  useDownloadStore.getState().start(id);
  const startedJob = useDownloadStore.getState().jobs.find((job) => job.id === id);
  if (startedJob?.state !== 'downloading') {
    notify.info(
      'Download Already Active',
      `${request.fileName} is already in Downloads.`,
      undefined,
      undefined,
      'downloads',
    );
    return null;
  }

  notify.info(
    'Download Started',
    `${request.fileName} is being saved to Downloads.`,
    undefined,
    undefined,
    'downloads',
  );
  try {
    await tauriApi.downloadMediaStart({
      id,
      url,
      fileName: request.fileName,
      headers: request.headers,
      directory: settings.downloadDirectory || undefined,
    });
    return null;
  } catch (error: unknown) {
    const message = getUserFacingErrorMessage(error, 'The download failed. Try again in a moment.');
    useDownloadStore.getState().fail(id, message);
    notify.error('Download Failed', message, undefined, undefined, 'downloads');
    return null;
  }
}

export function startQueuedDownloads() {
  const settings = useSettingsStore.getState();
  if (!settings.autoStartDownloads) return;
  const jobs = useDownloadStore.getState().jobs;
  let slots =
    settings.maxConcurrentDownloads - jobs.filter((job) => job.state === 'downloading').length;
  for (const job of jobs.filter((candidate) => candidate.state === 'queued')) {
    if (slots <= 0) break;
    slots -= 1;
    void startMediaDownload({
      id: job.id,
      url: job.sourceUrl,
      fileName: job.fileName,
      headers: job.headers,
      force: true,
    });
  }
}
