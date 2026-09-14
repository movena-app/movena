import { useMemo, useState } from 'react';
import { HardDriveDownload, Play, Trash2 } from 'lucide-react';
import { DetailsDialogShell } from '@/modules/catalog/public/components/DetailsDialogShell';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { deleteDownloadedItem } from '../services/mediaDownload';
import { playableFromDownloadedItem } from '@/modules/playback/public/lib/playback';
import type { DownloadedItem, DownloadedSeriesGroup } from '../lib/downloads';
import { formatBytes } from '@/shared/lib/formatBytes';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './DownloadedSeriesView.module.css';

interface DownloadedSeriesViewProps {
  group: DownloadedSeriesGroup;
  onClose: () => void;
}

/**
 * A series' downloaded episodes, purely from local metadata — no
 * `SeriesDetailsDialog` here, since that fetches live provider/TMDB data,
 * which is exactly what this view must not depend on.
 */
export function DownloadedSeriesView({ group, onClose }: DownloadedSeriesViewProps) {
  const { t, tn, number } = useI18n();
  const playStream = usePlayerStore((state) => state.playStream);
  const history = useLibraryStore((state) => state.history);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const seasons = useMemo(() => {
    const bySeason = new Map<string, DownloadedItem[]>();
    for (const episode of group.episodes) {
      const key = episode.seasonNum !== undefined ? String(episode.seasonNum) : '';
      const list = bySeason.get(key);
      if (list) list.push(episode);
      else bySeason.set(key, [episode]);
    }
    return Array.from(bySeason.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([season, episodes]) => ({
        season,
        episodes: episodes.sort((a, b) => Number(a.episodeNum ?? 0) - Number(b.episodeNum ?? 0)),
      }));
  }, [group.episodes]);

  const handlePlay = (episode: DownloadedItem) => {
    const resumeSeconds = history.find((entry) => entry.id === episode.id)?.currentTime;
    playStream(playableFromDownloadedItem(episode, resumeSeconds));
    onClose();
  };

  const handleRemove = async (episode: DownloadedItem) => {
    setRemovingId(episode.id);
    await deleteDownloadedItem(episode.id);
    setRemovingId(null);
  };

  return (
    <DetailsDialogShell
      onClose={onClose}
      ariaLabel={group.seriesTitle}
      modalClassName={styles.modal}
    >
      <div className={styles.header}>
        {group.seriesPosterUrl ? (
          <img src={group.seriesPosterUrl} alt="" className={styles.poster} />
        ) : (
          <div className={styles.posterPlaceholder} aria-hidden="true">
            <HardDriveDownload size={32} />
          </div>
        )}
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>{group.seriesTitle}</h1>
          <p className={styles.subtitle}>
            {tn(
              '{count} episode downloaded',
              '{count} episodes downloaded',
              group.episodes.length,
              { count: number(group.episodes.length) },
            )}
          </p>
        </div>
      </div>

      <div className={`${styles.seasons} subtle-scrollbar`}>
        {seasons.map(({ season, episodes }) => (
          <section key={season || 'unknown'} className={styles.season}>
            <h2 className={styles.seasonTitle}>
              {season ? t('Season {number}', { number: season }) : t('Episodes')}
            </h2>
            <div className={styles.episodeList}>
              {episodes.map((episode) => (
                <div key={episode.id} className={styles.episodeRow}>
                  <button
                    type="button"
                    className={styles.episodePlayBtn}
                    onClick={() => handlePlay(episode)}
                  >
                    <Play size={16} fill="currentColor" />
                    <span className={styles.episodeLabel}>
                      {episode.episodeNum !== undefined ? `E${episode.episodeNum} · ` : ''}
                      {episode.episodeTitle || episode.title}
                    </span>
                  </button>
                  <span className={styles.episodeSize}>
                    {formatBytes(episode.sizeBytes, number)}
                  </span>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => void handleRemove(episode)}
                    disabled={removingId === episode.id}
                    aria-label={t('Remove Download')}
                    title={t('Remove Download')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DetailsDialogShell>
  );
}
