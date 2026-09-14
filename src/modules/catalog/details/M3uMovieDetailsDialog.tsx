import { Download, Film, Heart, Play } from 'lucide-react';
import { useSourceStore } from '@/modules/sources/public/store/useSourceStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { parseMediaDisplayTitle } from '../lib/titleParser';
import { DetailsDialogShell } from '../components/DetailsDialogShell';
import { ErrorState } from '@/shared/ui/ErrorState';
import { downloadMediaItem } from '@/modules/downloads/public/services/mediaDownload';
import styles from './MovieDetailsDialog.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface M3uMovieDetailsDialogProps {
  movieId: string;
  movieTitle: string;
  moviePoster: string;
  sourceId: string;
  sourceItemId?: string | undefined;
  onClose: () => void;
}

/** A local M3U VOD has no provider detail endpoint, so its saved playlist
 * metadata is the canonical detail source. */
export function M3uMovieDetailsDialog({
  movieId,
  movieTitle,
  moviePoster,
  sourceId,
  sourceItemId,
  onClose,
}: M3uMovieDetailsDialogProps) {
  const { t, number } = useI18n();
  const entry = useSourceStore((state) =>
    state.runtimes[sourceId]?.playlist?.entries.find(
      (candidate) => candidate.id === (sourceItemId || movieId),
    ),
  );
  const playStream = usePlayerStore((state) => state.playStream);
  const isFavorite = useLibraryStore((state) =>
    state.favorites.some((item) => item.id === movieId),
  );
  const historyItem = useLibraryStore((state) => state.history.find((item) => item.id === movieId));
  const addFavorite = useLibraryStore((state) => state.addFavorite);
  const removeFavorite = useLibraryStore((state) => state.removeFavorite);
  const parsed = parseMediaDisplayTitle(entry?.title || movieTitle, entry?.year);

  if (!entry) {
    return (
      <DetailsDialogShell onClose={onClose} ariaLabel="Movie details" stateLayout>
        <ErrorState
          modal
          title="Movie unavailable"
          description="This playlist item is no longer available. Refresh the source and try again."
          detail={`No M3U playlist entry matched item "${sourceItemId || movieId}" in source "${sourceId}".`}
          actionLabel="Close"
          onAction={onClose}
        />
      </DetailsDialogShell>
    );
  }

  const play = () => {
    playStream({
      id: movieId,
      sourceItemId: entry.id,
      sourceId,
      title: parsed.cleanTitle,
      type: 'vod',
      streamUrl: entry.url,
      httpHeaders: entry.headers,
      posterUrl: entry.logo || moviePoster,
      startPosition: historyItem?.currentTime || 0,
      knownDuration: entry.duration > 0 ? entry.duration : undefined,
    });
    onClose();
  };
  const toggleFavorite = () => {
    if (isFavorite) removeFavorite(movieId);
    else
      addFavorite({
        id: movieId,
        sourceItemId: entry.id,
        sourceId,
        title: parsed.cleanTitle,
        posterUrl: entry.logo || moviePoster,
        type: 'vod',
        streamUrl: entry.url,
        httpHeaders: entry.headers,
        description: entry.description,
      });
  };

  return (
    <DetailsDialogShell
      onClose={onClose}
      ariaLabel="Movie details"
      modalClassName={styles.movieModal}
    >
      <div className={styles.content}>
        <div className={`${styles.posterColumn} subtle-scrollbar`}>
          <div className={styles.posterWrapper}>
            {entry.logo || moviePoster ? (
              <img
                src={entry.logo || moviePoster}
                alt={parsed.cleanTitle}
                className={styles.poster}
              />
            ) : (
              <div className={styles.posterPlaceholder}>
                <Film size={44} />
                <span>{parsed.cleanTitle}</span>
              </div>
            )}
          </div>
          <div className={styles.actionButtons}>
            <button type="button" className={styles.playBtn} onClick={play} data-modal-primary>
              <Play size={20} fill="currentColor" />
              <span>{t(historyItem?.currentTime ? 'Resume' : 'Play Movie')}</span>
            </button>
            <div className={styles.iconActionRow}>
              <button
                type="button"
                className={`${styles.favoriteBtn} ${styles.iconActionButton} ${isFavorite ? styles.activeFavoriteBtn : ''}`}
                onClick={toggleFavorite}
                aria-label={t(isFavorite ? 'Remove from favorites' : 'Add to favorites')}
                aria-pressed={isFavorite}
              >
                <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className={`${styles.secondaryBtn} ${styles.iconActionButton}`}
                onClick={() =>
                  void downloadMediaItem({
                    id: movieId,
                    title: parsed.cleanTitle,
                    type: 'vod',
                    streamUrl: entry.url,
                    httpHeaders: entry.headers,
                    containerExtension: entry.url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1],
                    posterUrl: entry.logo || moviePoster,
                    description: entry.description,
                  })
                }
                aria-label={t('Download movie')}
              >
                <Download size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className={`${styles.detailsArea} subtle-scrollbar`}>
          <h1 className={styles.title}>{parsed.cleanTitle}</h1>
          <div className={styles.mediaFacts}>
            {entry.year && <span className={styles.factItem}>{entry.year}</span>}
            {entry.rating !== undefined && (
              <span className={styles.factItem}>
                {t('Rating {rating}', {
                  rating: number(entry.rating, { maximumFractionDigits: 1 }),
                })}
              </span>
            )}
            <span className={styles.factItem}>{entry.groupTitle}</span>
          </div>
          <div className={styles.plot}>
            {entry.description || t('No description is included in this playlist.')}
          </div>
        </div>
      </div>
    </DetailsDialogShell>
  );
}
