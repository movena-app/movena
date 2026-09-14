// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const events = vi.hoisted(() => ({ listen: vi.fn() }));
const service = vi.hoisted(() => ({
  startQueuedDownloads: vi.fn(),
  takePendingDownloadMetadata: vi.fn(),
}));
const notifications = vi.hoisted(() => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: events.listen }));
vi.mock('@/modules/downloads/services/mediaDownload', () => service);
vi.mock('@/shared/notifications/useNotificationStore', () => notifications);

import { useDownloadEvents } from '@/modules/downloads/hooks/useDownloadEvents';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';

let handler: ((event: { payload: any }) => void) | null = null;
const unlisten = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  handler = null;
  service.takePendingDownloadMetadata.mockReturnValue(undefined);
  events.listen.mockImplementation(async (_name: string, callback: typeof handler) => {
    handler = callback;
    return unlisten;
  });
  useDownloadStore.setState({ jobs: [], downloadedByLibraryId: {} });
  useDownloadStore
    .getState()
    .enqueue({ id: 'job-events', sourceUrl: 'https://media.test/movie', fileName: 'Movie.mp4' });
  useDownloadStore.getState().start('job-events');
});

describe('native download event subscription', () => {
  it('syncs completion, notifies the user, and starts the next queued job', async () => {
    const { unmount } = renderHook(() => useDownloadEvents());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() =>
      handler?.({
        payload: {
          id: 'job-events',
          state: 'completed',
          downloadedBytes: 100,
          totalBytes: 100,
          path: 'C:\\Movie.mp4',
        },
      }),
    );
    expect(useDownloadStore.getState().jobs[0]).toMatchObject({
      state: 'completed',
      progress: 1,
      filePath: 'C:\\Movie.mp4',
    });
    expect(notifications.notify.success).toHaveBeenCalledWith(
      'Download Complete',
      'Movie.mp4 was saved successfully.',
      undefined,
      undefined,
      'downloads',
    );
    expect(service.startQueuedDownloads).toHaveBeenCalledTimes(2);

    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it('turns a completed job with stashed metadata into a persisted downloaded item', async () => {
    service.takePendingDownloadMetadata.mockReturnValue({
      id: 'movie-1',
      type: 'vod',
      title: 'Movie',
    });
    renderHook(() => useDownloadEvents());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() =>
      handler?.({
        payload: {
          id: 'job-events',
          state: 'completed',
          downloadedBytes: 100,
          totalBytes: 100,
          path: 'C:\\Movie.mp4',
        },
      }),
    );

    expect(service.takePendingDownloadMetadata).toHaveBeenCalledWith('job-events');
    expect(useDownloadStore.getState().downloadedByLibraryId['movie-1']).toMatchObject({
      id: 'movie-1',
      jobId: 'job-events',
      filePath: 'C:\\Movie.mp4',
      fileName: 'Movie.mp4',
      sizeBytes: 100,
    });
  });

  it('leaves the downloaded library untouched when a completed job has no stashed metadata', async () => {
    renderHook(() => useDownloadEvents());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() =>
      handler?.({
        payload: {
          id: 'job-events',
          state: 'completed',
          downloadedBytes: 100,
          totalBytes: 100,
          path: 'C:\\Movie.mp4',
        },
      }),
    );

    expect(useDownloadStore.getState().downloadedByLibraryId).toEqual({});
  });

  it('reports native failures with a safe fallback message', async () => {
    renderHook(() => useDownloadEvents());
    await waitFor(() => expect(handler).not.toBeNull());
    act(() => handler?.({ payload: { id: 'job-events', state: 'failed', error: '' } }));
    expect(notifications.notify.error).toHaveBeenCalledWith(
      'Download Failed',
      'The download failed. Try again in a moment.',
      undefined,
      undefined,
      'downloads',
    );
  });
});
