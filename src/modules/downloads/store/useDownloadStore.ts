import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  cancelDownloadJob,
  createDownloadJob,
  normalizeDownloadJob,
  normalizeDownloadedItem,
  normalizeDownloadedItems,
  DOWNLOAD_JOB_STATES,
  retryDownloadJob,
  transitionDownloadJob,
  updateDownloadProgress,
  type DownloadStatusEvent,
  type DownloadJob,
  type DownloadedItem,
} from '../lib/downloads';

interface DownloadState {
  jobs: DownloadJob[];
  /** Completed downloads' permanent metadata snapshot, keyed by library id. Survives restarts. */
  downloadedByLibraryId: Record<string, DownloadedItem>;
  enqueue: (input: {
    id: string;
    sourceUrl: string;
    headers?: Record<string, string> | undefined;
    fileName?: string | undefined;
    totalBytes?: number | undefined;
  }) => void;
  start: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  updateProgress: (id: string, downloadedBytes: unknown, totalBytes?: unknown) => void;
  complete: (id: string, totalBytes?: unknown) => void;
  setFilePath: (id: string, path: unknown) => void;
  sync: (event: DownloadStatusEvent) => void;
  fail: (id: string, error: unknown) => void;
  retry: (id: string) => void;
  cancel: (id: string, reason?: unknown) => void;
  remove: (id: string) => void;
  removeFinished: () => void;
  addDownloadedItem: (item: unknown) => void;
  removeDownloadedItem: (id: string) => void;
}

export function migrateDownloadState(value: unknown): {
  jobs: DownloadJob[];
  downloadedByLibraryId: Record<string, DownloadedItem>;
} {
  // Native downloads cannot survive an application restart, and persisting a
  // restartable job would write credential-bearing media URLs/headers to
  // localStorage. Version 3 deliberately discards all legacy queue records.
  // Version 4 adds a *separate*, permanent metadata snapshot for completed
  // downloads (title/poster/series link, never headers or a remote URL) so
  // Downloads and any card can render and play them without the provider —
  // carried forward here for anyone upgrading from an older version.
  const previous =
    value && typeof value === 'object' ? (value as { downloadedByLibraryId?: unknown }) : {};
  return {
    jobs: [],
    downloadedByLibraryId: normalizeDownloadedItems(previous.downloadedByLibraryId),
  };
}

const updateJob = (
  jobs: DownloadJob[],
  id: string,
  updater: (job: DownloadJob) => DownloadJob | null,
) =>
  jobs.flatMap((job) => {
    if (job.id !== id) return [job];
    const next = updater(job);
    return next ? [next] : [];
  });

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set) => ({
      jobs: [],
      downloadedByLibraryId: {},
      enqueue: (input) =>
        set((state) => {
          const job = createDownloadJob(input);
          return job && !state.jobs.some((candidate) => candidate.id === job.id)
            ? { jobs: [...state.jobs, job] }
            : state;
        }),
      start: (id) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) => transitionDownloadJob(job, { type: 'start' })),
        })),
      pause: (id) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) => transitionDownloadJob(job, { type: 'pause' })),
        })),
      resume: (id) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) => transitionDownloadJob(job, { type: 'resume' })),
        })),
      updateProgress: (id, downloadedBytes, totalBytes) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) =>
            updateDownloadProgress(job, downloadedBytes, totalBytes),
          ),
        })),
      complete: (id, totalBytes) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) =>
            transitionDownloadJob(job, { type: 'complete', totalBytes }),
          ),
        })),
      setFilePath: (id, path) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id && typeof path === 'string' && path.trim()
              ? { ...job, filePath: path.trim() }
              : job,
          ),
        })),
      sync: (event) =>
        set((state) => ({
          jobs: state.jobs.map((job) => {
            if (
              job.id !== event.id ||
              typeof event.state !== 'string' ||
              !(DOWNLOAD_JOB_STATES as readonly string[]).includes(event.state)
            )
              return job;
            // Native events can arrive after a cancel/complete race. Once the
            // frontend has observed a terminal state, a late event must not revive
            // the job or make the UI offer an impossible action.
            if (['completed', 'failed', 'cancelled'].includes(job.state)) return job;
            const hasProgress =
              event.state === 'completed' ||
              (typeof event.downloadedBytes === 'number' &&
                Number.isFinite(event.downloadedBytes) &&
                (event.downloadedBytes > 0 ||
                  (typeof event.totalBytes === 'number' && Number.isFinite(event.totalBytes))));
            const downloadedBytes =
              hasProgress &&
              typeof event.downloadedBytes === 'number' &&
              Number.isFinite(event.downloadedBytes)
                ? event.downloadedBytes
                : job.downloadedBytes;
            const totalBytes =
              hasProgress &&
              typeof event.totalBytes === 'number' &&
              Number.isFinite(event.totalBytes)
                ? event.totalBytes
                : job.totalBytes;
            const next = normalizeDownloadJob({
              ...job,
              state: event.state,
              downloadedBytes,
              totalBytes,
              ...(typeof event.path === 'string' && event.path.trim()
                ? { filePath: event.path.trim() }
                : {}),
              ...(event.error !== undefined ? { error: event.error } : {}),
            });
            return next ?? job;
          }),
        })),
      fail: (id, error) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) =>
            transitionDownloadJob(job, { type: 'fail', error }),
          ),
        })),
      retry: (id) =>
        set((state) => ({ jobs: updateJob(state.jobs, id, (job) => retryDownloadJob(job)) })),
      cancel: (id, reason) =>
        set((state) => ({
          jobs: updateJob(state.jobs, id, (job) => cancelDownloadJob(job, reason)),
        })),
      remove: (id) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),
      removeFinished: () =>
        set((state) => ({
          jobs: state.jobs.filter(
            (job) => !['completed', 'failed', 'cancelled'].includes(job.state),
          ),
        })),
      addDownloadedItem: (item) =>
        set((state) => {
          const normalized = normalizeDownloadedItem(item);
          return normalized
            ? {
                downloadedByLibraryId: {
                  ...state.downloadedByLibraryId,
                  [normalized.id]: normalized,
                },
              }
            : state;
        }),
      removeDownloadedItem: (id) =>
        set((state) => {
          if (!(id in state.downloadedByLibraryId)) return state;
          const next = { ...state.downloadedByLibraryId };
          delete next[id];
          return { downloadedByLibraryId: next };
        }),
    }),
    {
      name: 'movena-downloads-v1',
      version: 4,
      migrate: migrateDownloadState,
      // Keep the persist API for reset/migration. Jobs never serialize (see
      // migrateDownloadState); downloadedByLibraryId is the one slice meant to
      // survive restarts — it never carries provider headers or a raw stream URL.
      partialize: (state) => ({ jobs: [], downloadedByLibraryId: state.downloadedByLibraryId }),
    },
  ),
);
