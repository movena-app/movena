import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, HardDriveDownload, Heart, MonitorPlay, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getM3uSeriesGroups } from '@/modules/sources/public/data/m3uClient';
import { useSourceStore } from '@/modules/sources/public/store/useSourceStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { useDownloadStore } from '@/modules/downloads/public/store/useDownloadStore';
import {
  downloadSeriesSeason,
  type DownloadableMediaItem,
} from '@/modules/downloads/public/services/mediaDownload';
import { DetailsDialogShell } from '../components/DetailsDialogShell';
import { ErrorState } from '@/shared/ui/ErrorState';
import {
  parseEpisodeTitle,
  parseMediaDisplayTitle,
  formatEpisodePlaybackTitle,
} from '../lib/titleParser';
import styles from './SeriesDetailsDialog.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { SeriesUpcomingEpisodes } from '@/modules/guide/public/components/SeriesUpcomingEpisodes';
import { episodeScheduleKey } from '@/modules/guide/public/lib/upcoming';
import { Select } from '@/shared/ui/Select';
import { playableFromDownloadedItem } from '@/modules/playback/public/lib/playback';

interface M3uSeriesDetailsDialogProps {
  seriesId: string;
  seriesTitle: string;
  seriesPoster: string;
  sourceId: string;
  sourceItemId?: string | undefined;
  initialSeasonNumber?: number | undefined;
  initialEpisodeNumber?: number | undefined;
  onClose: () => void;
}

export function M3uSeriesDetailsDialog({
  seriesId,
  seriesTitle,
  seriesPoster,
  sourceId,
  sourceItemId,
  initialSeasonNumber,
  initialEpisodeNumber,
  onClose,
}: M3uSeriesDetailsDialogProps) {
  const { t, number } = useI18n();
  const navigate = useNavigate();
  const titleId = useId();
  const playlist = useSourceStore((state) => state.runtimes[sourceId]?.playlist);
  const episodes = useMemo(
    () => (playlist ? getM3uSeriesGroups(playlist).get(sourceItemId || seriesId) : undefined),
    [playlist, seriesId, sourceItemId],
  );
  const playStream = usePlayerStore((state) => state.playStream);
  const isFavorite = useLibraryStore((state) =>
    state.favorites.some((item) => item.id === seriesId),
  );
  const addFavorite = useLibraryStore((state) => state.addFavorite);
  const removeFavorite = useLibraryStore((state) => state.removeFavorite);
  const historyItem = useLibraryStore((state) =>
    state.history.find((item) => item.id === seriesId),
  );
  const downloadedByLibraryId = useDownloadStore((state) => state.downloadedByLibraryId);
  const parsedSeries = parseMediaDisplayTitle(seriesTitle);
  const [selectedSeason, setSelectedSeason] = useState('');
  const requestedEpisodeRef = useRef<HTMLButtonElement>(null);
  const positionedEpisodeRef = useRef(false);
  const seasons = useMemo(
    () =>
      Array.from(
        new Set((episodes ?? []).map((entry) => String(entry.episode!.seasonNumber))),
      ).sort((left, right) => Number(left) - Number(right)),
    [episodes],
  );
  const seasonOptions = useMemo(
    () =>
      seasons.map((season) => ({
        value: season,
        label: t('Season {number}', { number: season }),
      })),
    [seasons, t],
  );
  const visibleEpisodes = useMemo(
    () =>
      selectedSeason
        ? (episodes ?? []).filter((entry) => String(entry.episode!.seasonNumber) === selectedSeason)
        : [],
    [episodes, selectedSeason],
  );
  const resumeEpisode = useMemo(() => {
    if (!historyItem) return undefined;
    return (episodes ?? []).find(
      (entry) =>
        entry.id === historyItem.episodeId?.toString() ||
        (String(entry.episode!.seasonNumber) === historyItem.seasonNum?.toString() &&
          entry.episode!.episodeNumber === Number(historyItem.episodeNum)),
    );
  }, [episodes, historyItem]);
  const primaryEpisode = resumeEpisode ?? visibleEpisodes[0];
  const availableEpisodeKeys = useMemo(
    () =>
      new Set(
        (episodes ?? []).map((entry) =>
          episodeScheduleKey(entry.episode!.seasonNumber, entry.episode!.episodeNumber),
        ),
      ),
    [episodes],
  );

  useEffect(() => {
    setSelectedSeason('');
    positionedEpisodeRef.current = false;
  }, [initialEpisodeNumber, initialSeasonNumber, seriesId]);

  useEffect(() => {
    if (!seasons.length || selectedSeason) return;
    const requestedSeason = initialSeasonNumber?.toString();
    const savedSeason = historyItem?.seasonNum?.toString();
    setSelectedSeason(
      requestedSeason && seasons.includes(requestedSeason)
        ? requestedSeason
        : savedSeason && seasons.includes(savedSeason)
          ? savedSeason
          : (seasons[0] ?? ''),
    );
  }, [historyItem?.seasonNum, initialSeasonNumber, seasons, selectedSeason]);

  useEffect(() => {
    if (
      positionedEpisodeRef.current ||
      !initialEpisodeNumber ||
      (initialSeasonNumber && selectedSeason !== String(initialSeasonNumber)) ||
      !requestedEpisodeRef.current
    )
      return;
    positionedEpisodeRef.current = true;
    requestedEpisodeRef.current.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [initialEpisodeNumber, initialSeasonNumber, selectedSeason, visibleEpisodes]);

  if (!episodes?.length) {
    return (
      <DetailsDialogShell onClose={onClose} ariaLabel="Series details" stateLayout>
        <ErrorState
          modal
          title="Series unavailable"
          description="This playlist series is no longer available. Refresh the source and try again."
          detail={`No playable M3U series episodes matched item "${sourceItemId || seriesId}" in source "${sourceId}".`}
          actionLabel="Close"
          onAction={onClose}
        />
      </DetailsDialogShell>
    );
  }
  const play = (entry: (typeof episodes)[number], startPosition = 0) => {
    // A downloaded episode plays straight from disk — instantly, online or
    // offline — skipping the playlist URL entirely.
    const downloaded = downloadedByLibraryId[entry.id];
    if (downloaded) {
      playStream(playableFromDownloadedItem(downloaded, startPosition));
      onClose();
      return;
    }

    const episode = entry.episode!;
    const parsedEpisode = parseEpisodeTitle(entry.title, {
      seriesTitle: parsedSeries.cleanTitle,
      seasonNum: episode.seasonNumber,
      episodeNum: episode.episodeNumber,
    });
    playStream({
      id: entry.id,
      sourceItemId: entry.id,
      sourceId,
      type: 'series',
      streamUrl: entry.url,
      httpHeaders: entry.headers,
      title: formatEpisodePlaybackTitle(
        parsedSeries.cleanTitle,
        String(episode.seasonNumber),
        episode.episodeNumber,
        parsedEpisode.cleanTitle,
      ),
      posterUrl: entry.logo || seriesPoster,
      seriesPosterUrl: seriesPoster,
      seriesId,
      seriesSourceItemId: sourceItemId || seriesId,
      seriesTitle: parsedSeries.cleanTitle,
      seasonNum: String(episode.seasonNumber),
      episodeNum: episode.episodeNumber,
      episodeTitle: parsedEpisode.cleanTitle,
      startPosition,
      knownDuration: entry.duration > 0 ? entry.duration : historyItem?.duration,
    });
    onClose();
  };

  const handleDownloadSeason = () => {
    const episodesToDownload: DownloadableMediaItem[] = visibleEpisodes.map((entry) => {
      const episode = entry.episode!;
      const parsedEpisode = parseEpisodeTitle(entry.title, {
        seriesTitle: parsedSeries.cleanTitle,
        seasonNum: episode.seasonNumber,
        episodeNum: episode.episodeNumber,
      });
      return {
        id: entry.id,
        title: formatEpisodePlaybackTitle(
          parsedSeries.cleanTitle,
          String(episode.seasonNumber),
          episode.episodeNumber,
          parsedEpisode.cleanTitle,
        ),
        type: 'series',
        streamUrl: entry.url,
        httpHeaders: entry.headers,
        posterUrl: entry.logo || seriesPoster,
        description: entry.description,
        seriesId,
        seriesSourceItemId: sourceItemId || seriesId,
        seriesTitle: parsedSeries.cleanTitle,
        seriesPosterUrl: seriesPoster,
        seasonNum: String(episode.seasonNumber),
        episodeNum: episode.episodeNumber,
        episodeTitle: parsedEpisode.cleanTitle,
      };
    });
    downloadSeriesSeason(`Season ${selectedSeason}`, episodesToDownload);
  };
  return (
    <DetailsDialogShell onClose={onClose} labelledBy={titleId}>
      <div className={styles.content}>
        <div className={`${styles.posterColumn} subtle-scrollbar`}>
          <div className={styles.posterWrapper}>
            {seriesPoster ? (
              <img src={seriesPoster} alt={parsedSeries.cleanTitle} className={styles.poster} />
            ) : (
              <div className={styles.posterPlaceholder}>
                <MonitorPlay size={44} />
                <span>{parsedSeries.cleanTitle}</span>
              </div>
            )}
          </div>
          <div className={styles.actionButtons}>
            {primaryEpisode && (
              <button
                type="button"
                className={styles.playBtn}
                onClick={() =>
                  play(primaryEpisode, resumeEpisode ? (historyItem?.currentTime ?? 0) : 0)
                }
                data-modal-primary
              >
                <Play size={20} fill="currentColor" />
                <span>
                  {resumeEpisode
                    ? `${t(historyItem?.currentTime ? 'Resume' : 'Play')} S${resumeEpisode.episode!.seasonNumber}:E${resumeEpisode.episode!.episodeNumber}`
                    : t('Start Watching')}
                </span>
              </button>
            )}
            <button
              type="button"
              className={`${styles.favoriteBtn} ${isFavorite ? styles.activeFavoriteBtn : ''}`}
              onClick={() =>
                isFavorite
                  ? removeFavorite(seriesId)
                  : addFavorite({
                      id: seriesId,
                      sourceItemId: sourceItemId || seriesId,
                      sourceId,
                      title: parsedSeries.cleanTitle,
                      posterUrl: seriesPoster,
                      type: 'series',
                    })
              }
              aria-label={t(isFavorite ? 'Remove from favorites' : 'Add to favorites')}
              aria-pressed={isFavorite}
            >
              <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
              <span>{t(isFavorite ? 'In Favorites' : 'Add to Favorites')}</span>
            </button>
          </div>
        </div>
        <div className={`${styles.detailsArea} subtle-scrollbar`}>
          <h1 className={styles.title} id={titleId}>
            {parsedSeries.cleanTitle}
          </h1>
          <section className={styles.episodeSection} aria-label={t('Episodes')}>
            <div className={styles.episodeBrowserHeader}>
              <Select
                value={selectedSeason}
                options={seasonOptions}
                onChange={setSelectedSeason}
                width={180}
              />
              {visibleEpisodes.length > 0 && (
                <button
                  type="button"
                  className={styles.downloadSeasonBtn}
                  onClick={handleDownloadSeason}
                >
                  <Download size={14} />
                  <span>{t('Download Season')}</span>
                </button>
              )}
            </div>
            <div className={styles.episodesList}>
              {visibleEpisodes.map((entry) => {
                const episode = entry.episode!;
                const isRequestedEpisode =
                  initialEpisodeNumber === episode.episodeNumber &&
                  (!initialSeasonNumber || initialSeasonNumber === episode.seasonNumber);
                const isDownloaded = Boolean(downloadedByLibraryId[entry.id]);
                return (
                  <button
                    type="button"
                    key={entry.id}
                    ref={isRequestedEpisode ? requestedEpisodeRef : undefined}
                    className={`${styles.episodeCard} ${isRequestedEpisode ? styles.requestedEpisodeCard : ''}`}
                    onClick={() => play(entry)}
                    aria-current={isRequestedEpisode ? 'true' : undefined}
                    aria-label={t('Play season {season}, episode {episode}', {
                      season: number(episode.seasonNumber),
                      episode: number(episode.episodeNumber),
                    })}
                  >
                    <div className={styles.episodeImageWrapper}>
                      {entry.logo ? (
                        <img src={entry.logo} alt="" className={styles.episodeImage} />
                      ) : (
                        <MonitorPlay size={22} />
                      )}
                      {isDownloaded && (
                        <span className={styles.episodeDownloadedBadge} title={t('Downloaded')}>
                          <HardDriveDownload size={13} />
                        </span>
                      )}
                    </div>
                    <div className={styles.episodeInfo}>
                      <div className={styles.episodeHeaderLine}>
                        <span className={styles.episodeBadge}>E{episode.episodeNumber}</span>
                        <span className={styles.episodeTitle}>
                          {episode.episodeTitle || entry.title}
                        </span>
                      </div>
                      {entry.description && (
                        <p className={styles.episodePlot}>{entry.description}</p>
                      )}
                    </div>
                    <Play size={18} />
                  </button>
                );
              })}
              <SeriesUpcomingEpisodes
                seriesId={seriesId}
                availableEpisodeKeys={availableEpisodeKeys}
                onViewSchedule={() => {
                  onClose();
                  navigate('/upcoming');
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </DetailsDialogShell>
  );
}
