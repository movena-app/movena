import { useEffect } from 'react';
import { desktopApi } from '@/platform/desktop';
import { useDownloadStore } from '../store/useDownloadStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { startQueuedDownloads, takePendingDownloadMetadata } from '../services/mediaDownload';
import type { DownloadStatusEvent } from '../lib/downloads';

/** Keeps the persisted queue synchronized with native download lifecycle events. */
export function useDownloadEvents() {
  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    let disposed = false;
    const subscription = desktopApi.onDownloadEvent((payload: DownloadStatusEvent) => {
      useDownloadStore.getState().sync(payload);
      const job = useDownloadStore.getState().jobs.find((candidate) => candidate.id === payload.id);
      if (payload.state === 'completed' && job) {
        notify.success(
          'Download Complete',
          `${job.fileName} was saved successfully.`,
          undefined,
          undefined,
          'downloads',
        );
        // The metadata snapshot captured when this job was queued (see
        // mediaDownload.ts) is what lets the file show up as a playable
        // card with zero provider/network access from here on — a job
        // queued without one (e.g. one already in flight before an update
        // that added this) just stays a file findable via "Show in Folder".
        const metadata = job.filePath ? takePendingDownloadMetadata(job.id) : undefined;
        if (metadata && job.filePath) {
          useDownloadStore.getState().addDownloadedItem({
            ...metadata,
            jobId: job.id,
            filePath: job.filePath,
            fileName: job.fileName,
            sizeBytes: job.totalBytes ?? job.downloadedBytes,
            downloadedAt: Date.now(),
          });
        }
      } else if (payload.state === 'failed') {
        notify.error(
          'Download Failed',
          getUserFacingErrorMessage(payload.error, 'The download failed. Try again in a moment.'),
          undefined,
          undefined,
          'downloads',
        );
      }
      if (
        payload.state === 'completed' ||
        payload.state === 'failed' ||
        payload.state === 'cancelled'
      ) {
        startQueuedDownloads();
      }
    });
    void subscription.then((unlisten) => {
      if (disposed) unlisten();
      else startQueuedDownloads();
    });
    return () => {
      disposed = true;
      void subscription.then((unlisten) => unlisten());
    };
  }, []);
}
