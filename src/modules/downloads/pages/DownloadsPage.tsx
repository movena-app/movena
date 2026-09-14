import { useMemo, useState } from 'react';
import { CatalogPageHeader } from '@/modules/catalog/public/components/CatalogPageHeader';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Download, FileVideo, RefreshCw, Trash2, X } from 'lucide-react';
import { Pause, Play, Ban, FolderOpen } from 'lucide-react';
import { desktopApi } from '@/platform/desktop';
import { useDownloadStore } from '../store/useDownloadStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { deleteDownloadedItem, startMediaDownload } from '../services/mediaDownload';
import {
  groupDownloadedSeries,
  type DownloadedItem,
  type DownloadedSeriesGroup,
  type DownloadJob,
} from '../lib/downloads';
import { playableFromDownloadedItem } from '@/modules/playback/public/lib/playback';
import { tauriApi } from '@/platform/tauri';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import appStyles from '@/app/shell/AppLayout.module.css';
import styles from './DownloadsPage.module.css';
import { Button, IconButton } from '@/shared/ui/Button';
import { useI18n } from '@/shared/i18n/i18n';
import { formatBytes } from '@/shared/lib/formatBytes';
import { MediaCard } from '@/modules/catalog/public/components/MediaCard';
import type { MediaItem } from '@/modules/catalog/public/model/media';
import { DownloadedSeriesView } from '../components/DownloadedSeriesView';

function DownloadRow({ job }: { job: DownloadJob }) {
  const { t, number } = useI18n();
  const stateLabel = () => {
    if (job.state === 'downloading')
      return job.progress === null
        ? t('Downloading')
        : `${number(Math.round(job.progress * 100))} %`;
    if (job.state === 'completed') return t('Completed');
    if (job.state === 'failed') return t('Failed');
    if (job.state === 'cancelled') return t('Cancelled');
    if (job.state === 'paused') return t('Paused');
    return t('Queued');
  };
  const retry = useDownloadStore((state) => state.retry);
  const remove = useDownloadStore((state) => state.remove);
  const pause = useDownloadStore((state) => state.pause);
  const resume = useDownloadStore((state) => state.resume);
  const cancel = useDownloadStore((state) => state.cancel);
  const isRetryable = job.state === 'failed' || job.state === 'cancelled';
  const canRemove =
    job.state === 'completed' || job.state === 'cancelled' || job.state === 'failed';
  const byteText = job.totalBytes
    ? t('{downloaded} of {total}', {
        downloaded: formatBytes(job.downloadedBytes, number) ?? '0 B',
        total: formatBytes(job.totalBytes, number) ?? '0 B',
      })
    : formatBytes(job.downloadedBytes, number);

  const handleRetry = () => {
    retry(job.id);
    void startMediaDownload({
      id: job.id,
      url: job.sourceUrl,
      fileName: job.fileName,
      headers: job.headers,
      force: true,
    });
  };

  const runNativeAction = async (
    action: () => Promise<void>,
    update: () => void,
    message: string,
  ) => {
    try {
      await action();
      update();
    } catch (error: unknown) {
      notify.error(
        'Download Action Failed',
        getUserFacingErrorMessage(error, message),
        undefined,
        undefined,
        'downloads',
      );
    }
  };

  const handleStart = () => {
    void startMediaDownload({
      id: job.id,
      url: job.sourceUrl,
      fileName: job.fileName,
      headers: job.headers,
      force: true,
    });
  };

  const handleOpen = () => {
    if (!job.filePath) return;
    void desktopApi.revealItemInDir(job.filePath).catch((error: unknown) => {
      notify.error(
        'File Could Not Be Opened',
        getUserFacingErrorMessage(error, 'Movena could not reveal the downloaded file.'),
        undefined,
        undefined,
        'downloads',
      );
    });
  };

  const handleCancel = () => {
    if (job.state === 'queued') {
      cancel(job.id, 'Cancelled by user');
      return;
    }
    void runNativeAction(
      () => tauriApi.downloadMediaCancel(job.id),
      () => cancel(job.id, 'Cancelled by user'),
      'The download could not be cancelled.',
    );
  };

  return (
    <article className={styles.downloadRow}>
      <div className={styles.fileIcon} aria-hidden="true">
        <FileVideo size={20} />
      </div>
      <div className={styles.rowBody}>
        <div className={styles.rowTopline}>
          <strong className={styles.fileName}>{job.fileName}</strong>
          <span className={`${styles.status} ${styles[`status${job.state}`]}`}>{stateLabel()}</span>
        </div>
        {job.state === 'downloading' && (
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label={t('{state} progress', { state: stateLabel() })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress === null ? undefined : Math.round(job.progress * 100)}
          >
            <span style={{ width: job.progress === null ? '35%' : `${job.progress * 100}%` }} />
          </div>
        )}
        <div className={styles.rowMeta}>
          <span>
            {byteText ??
              (job.state === 'failed'
                ? t('Failed')
                : job.state === 'downloading'
                  ? t('Downloading…')
                  : job.state === 'paused'
                    ? t('Paused')
                    : t('Queued to start'))}
          </span>
          {job.state === 'failed' && job.error && (
            <span className={styles.errorMessage}>{job.error}</span>
          )}
        </div>
      </div>
      <div className={styles.rowActions}>
        {job.state === 'queued' && (
          <IconButton
            size="sm"
            className={styles.actionButton}
            onClick={handleStart}
            aria-label={`Start ${job.fileName}`}
            title="Start download"
          >
            <Play size={15} />
          </IconButton>
        )}
        {job.state === 'downloading' && (
          <IconButton
            size="sm"
            className={styles.actionButton}
            onClick={() =>
              void runNativeAction(
                () => tauriApi.downloadMediaPause(job.id),
                () => pause(job.id),
                'The download could not be paused.',
              )
            }
            aria-label={`Pause ${job.fileName}`}
            title="Pause download"
          >
            <Pause size={15} />
          </IconButton>
        )}
        {job.state === 'paused' && (
          <IconButton
            size="sm"
            className={styles.actionButton}
            onClick={() =>
              void runNativeAction(
                () => tauriApi.downloadMediaResume(job.id),
                () => resume(job.id),
                'The download could not be resumed.',
              )
            }
            aria-label={`Resume ${job.fileName}`}
            title="Resume download"
          >
            <Play size={15} />
          </IconButton>
        )}
        {(job.state === 'queued' || job.state === 'downloading' || job.state === 'paused') && (
          <IconButton
            size="sm"
            className={`${styles.actionButton} ${styles.dangerAction}`}
            onClick={handleCancel}
            aria-label={`Cancel ${job.fileName}`}
            title="Cancel download"
          >
            <Ban size={15} />
          </IconButton>
        )}
        {job.state === 'completed' && job.filePath && (
          <IconButton
            size="sm"
            className={styles.actionButton}
            onClick={handleOpen}
            aria-label={`Show ${job.fileName} in folder`}
            title="Show in folder"
          >
            <FolderOpen size={15} />
          </IconButton>
        )}
        {isRetryable && (
          <IconButton
            size="sm"
            className={styles.actionButton}
            onClick={handleRetry}
            aria-label={`Retry ${job.fileName}`}
            title="Retry download"
          >
            <RefreshCw size={15} />
          </IconButton>
        )}
        {canRemove && (
          <IconButton
            size="sm"
            className={styles.actionButton}
            onClick={() => remove(job.id)}
            aria-label={`Remove ${job.fileName}`}
            title="Remove from list"
          >
            <X size={15} />
          </IconButton>
        )}
      </div>
    </article>
  );
}

function mediaItemFromDownloadedItem(item: DownloadedItem): MediaItem {
  return {
    id: item.id,
    title: item.title,
    posterUrl: item.posterUrl || '',
    type: item.type,
    tags: item.tags,
    country: item.country,
    description: item.description,
  };
}

/** A movie tile that, once clicked, plays straight from disk — every item here is already downloaded. */
function DownloadedMovieCard({
  item,
  onPlay,
  onRemove,
}: {
  item: DownloadedItem;
  onPlay: (item: DownloadedItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={styles.movieCardWrapper}>
      <MediaCard item={mediaItemFromDownloadedItem(item)} onClick={() => onPlay(item)} />
      <IconButton
        size="sm"
        className={styles.movieRemoveBtn}
        onClick={(event) => {
          event.stopPropagation();
          onRemove(item.id);
        }}
        aria-label="Remove Download"
        title="Remove Download"
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

function DownloadedSeriesCard({
  group,
  onOpen,
}: {
  group: DownloadedSeriesGroup;
  onOpen: (group: DownloadedSeriesGroup) => void;
}) {
  const { tn, number } = useI18n();
  const item: MediaItem = {
    id: group.seriesId,
    title: group.seriesTitle,
    posterUrl: group.seriesPosterUrl || '',
    type: 'series',
    subtitle: tn(
      '{count} episode downloaded',
      '{count} episodes downloaded',
      group.episodes.length,
      { count: number(group.episodes.length) },
    ),
  };
  return <MediaCard item={item} onClick={() => onOpen(group)} />;
}

export function DownloadsPage() {
  const { t, tn, number } = useI18n();
  const jobs = useDownloadStore((state) => state.jobs);
  const downloadedByLibraryId = useDownloadStore((state) => state.downloadedByLibraryId);
  const removeFinished = useDownloadStore((state) => state.removeFinished);
  const playStream = usePlayerStore((state) => state.playStream);
  const history = useLibraryStore((state) => state.history);
  const [selectedSeriesGroup, setSelectedSeriesGroup] = useState<DownloadedSeriesGroup | null>(
    null,
  );

  const activeCount = jobs.filter(
    (job) => job.state === 'queued' || job.state === 'downloading' || job.state === 'paused',
  ).length;

  const downloadedItems = useMemo(
    () => Object.values(downloadedByLibraryId),
    [downloadedByLibraryId],
  );
  const movieItems = useMemo(
    () =>
      downloadedItems
        .filter((item) => item.type === 'vod')
        .sort((a, b) => b.downloadedAt - a.downloadedAt),
    [downloadedItems],
  );
  const seriesGroups = useMemo(() => groupDownloadedSeries(downloadedItems), [downloadedItems]);

  const hasActiveJobs = jobs.length > 0;
  const hasDownloadedContent = movieItems.length > 0 || seriesGroups.length > 0;
  const totalDownloadedCount =
    movieItems.length + seriesGroups.reduce((sum, group) => sum + group.episodes.length, 0);

  const handlePlayMovie = (item: DownloadedItem) => {
    const resumeSeconds = history.find((entry) => entry.id === item.id)?.currentTime;
    playStream(playableFromDownloadedItem(item, resumeSeconds));
  };

  return (
    <div className={appStyles.page}>
      <CatalogPageHeader
        title="Downloads"
        meta={`${tn('{count} download', '{count} downloads', totalDownloadedCount, { count: number(totalDownloadedCount) })}${activeCount > 0 ? ` · ${tn('{count} active', '{count} active', activeCount, { count: number(activeCount) })}` : ''}`}
        actions={
          jobs.some(
            (job) =>
              job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled',
          ) ? (
            <Button size="sm" className={styles.clearButton} onClick={removeFinished}>
              <Trash2 size={14} />
              <span>{t('Clear Finished')}</span>
            </Button>
          ) : undefined
        }
      />

      {!hasActiveJobs && !hasDownloadedContent ? (
        <EmptyState
          icon={Download}
          title="No Downloads Yet"
          description="Downloads started from the player will appear here — movies and series play straight from your device, even offline."
        />
      ) : (
        <div className={`${styles.downloadsScroll} subtle-scrollbar`}>
          {hasActiveJobs && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('Downloading')}</h2>
              <div className={styles.downloadList} aria-label={t('Downloads')}>
                {[...jobs]
                  .sort((left, right) => right.updatedAt - left.updatedAt)
                  .map((job) => (
                    <DownloadRow key={job.id} job={job} />
                  ))}
              </div>
            </section>
          )}

          {movieItems.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('Movies')}</h2>
              <div className={styles.mediaGrid}>
                {movieItems.map((item) => (
                  <DownloadedMovieCard
                    key={item.id}
                    item={item}
                    onPlay={handlePlayMovie}
                    onRemove={(id) => void deleteDownloadedItem(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {seriesGroups.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('Series')}</h2>
              <div className={styles.mediaGrid}>
                {seriesGroups.map((group) => (
                  <DownloadedSeriesCard
                    key={group.seriesId}
                    group={group}
                    onOpen={setSelectedSeriesGroup}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedSeriesGroup && (
        <DownloadedSeriesView
          group={selectedSeriesGroup}
          onClose={() => setSelectedSeriesGroup(null)}
        />
      )}
    </div>
  );
}
