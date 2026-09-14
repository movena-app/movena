import { useEffect, useId, useState, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Heart,
  HardDriveDownload,
  MonitorPlay,
  Play,
  Settings,
  Star,
} from 'lucide-react';
import {
  getXtreamCredentials,
  resolveXtreamSourceId,
  useAuthStore,
} from '@/modules/sources/public/store/useAuthStore';
import type { XtreamEpisode } from '@/modules/sources/public/data/xtreamClient';
import { useSeriesInfo } from '../data/useDetails';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { useDownloadStore } from '@/modules/downloads/public/store/useDownloadStore';
import {
  downloadSeriesSeason,
  type DownloadableMediaItem,
} from '@/modules/downloads/public/services/mediaDownload';
import { formatDurationLabel, formatRemaining } from '@/shared/lib/time';
import {
  formatEpisodePlaybackTitle,
  parseEpisodeTitle,
  parseMediaDisplayTitle,
} from '../lib/titleParser';
import { getPrimaryMediaTags, getTagColorType, mergeMediaTags } from '@/shared/lib/mediaTags';
import { countryName } from '@/shared/lib/categoryName';
import { SeriesDetailSkeleton } from '@/shared/ui/Skeleton';
import { useMediaContextMenus } from '../hooks/useMediaContextMenus';
import { DetailsDialogShell } from '../components/DetailsDialogShell';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Select } from '@/shared/ui/Select';
import { getErrorPresentation } from '@/shared/lib/error';
import styles from './SeriesDetailsDialog.module.css';
import {
  playableFromDownloadedItem,
  resolveEpisodePlayback,
} from '@/modules/playback/public/lib/playback';
import { xtreamItemId } from '@/modules/sources/public/lib/sourceIdentity';
import { M3uSeriesDetailsDialog } from './M3uSeriesDetailsDialog';
import { useI18n } from '@/shared/i18n/i18n';
import { useNavigate } from 'react-router-dom';
import { SeriesUpcomingEpisodes } from '@/modules/guide/public/components/SeriesUpcomingEpisodes';
import { episodeScheduleKey } from '@/modules/guide/public/lib/upcoming';
import { useTmdbDetailEnrichment } from '@/modules/metadata/public/hooks/useTmdbDetailsEnrichment';
import { buildDetailPresentation } from './detailPresentation';

interface SeriesDetailsDialogProps {
  seriesId: string;
  seriesTitle: string;
  seriesPoster: string;
  sourceId?: string | undefined;
  sourceItemId?: string | undefined;
  initialSeasonNumber?: number | undefined;
  initialEpisodeNumber?: number | undefined;
  onClose: () => void;
}

export function SeriesDetailsDialog(props: SeriesDetailsDialogProps) {
  if (props.sourceId?.startsWith('m3u-')) {
    return <M3uSeriesDetailsDialog {...props} sourceId={props.sourceId} />;
  }
  return <XtreamSeriesDetailsDialog {...props} />;
}

function XtreamSeriesDetailsDialog({
  seriesId,
  seriesTitle,
  seriesPoster,
  sourceId,
  sourceItemId,
  initialSeasonNumber,
  initialEpisodeNumber,
  onClose,
}: SeriesDetailsDialogProps) {
  const { t, tn, number, language } = useI18n();
  const navigate = useNavigate();
  const { handleMediaCardContextMenu } = useMediaContextMenus();
  const credentials = useAuthStore((state) => {
    const resolvedSourceId = sourceId === 'xtream' ? state.profiles[0]?.id : sourceId;
    return resolvedSourceId
      ? (state.runtimes[resolvedSourceId]?.credentials ?? null)
      : getXtreamCredentials();
  });
  const providerSeriesId = sourceItemId || seriesId;
  const resolvedSourceId = resolveXtreamSourceId(sourceId);
  const playStream = usePlayerStore((state) => state.playStream);
  const [imageError, setImageError] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const titleId = useId();

  const isFav = useLibraryStore((state) => state.favorites.some((f) => f.id === seriesId));
  const addFavorite = useLibraryStore((state) => state.addFavorite);
  const removeFavorite = useLibraryStore((state) => state.removeFavorite);

  const historyItem = useLibraryStore((state) => state.history.find((h) => h.id === seriesId));
  const watchedIds = useLibraryStore((state) => state.watched);
  const remainingLabel = formatRemaining(historyItem?.currentTime, historyItem?.duration, language);
  const downloadedByLibraryId = useDownloadStore((state) => state.downloadedByLibraryId);

  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const initialEpisodeRef = useRef<HTMLButtonElement>(null);
  const positionedEpisodeRef = useRef(false);

  const { data, isLoading, error, isFetching, refetch } = useSeriesInfo(providerSeriesId, sourceId);
  const enriched = useTmdbDetailEnrichment('tv', seriesTitle);

  const toggleFavorite = () => {
    if (isFav) removeFavorite(seriesId);
    else
      addFavorite({
        id: seriesId,
        title: seriesTitle,
        posterUrl: seriesPoster,
        type: 'series',
        sourceItemId: providerSeriesId,
        sourceId: Object.values(data?.episodes ?? {})[0]?.[0]?.source_id || sourceId,
        description: data?.info?.plot,
      });
  };

  const [isRetryingDetails, setIsRetryingDetails] = useState(false);
  const prerequisiteError = !credentials
    ? `No credentials are loaded for Xtream source "${sourceId ?? 'default'}".`
    : !String(providerSeriesId).trim()
      ? 'Series details cannot be loaded because the provider item id is empty.'
      : null;
  const effectiveError = error ?? prerequisiteError;
  const errorPresentation = getErrorPresentation(effectiveError, 'Series details');
  const [retryPresentation, setRetryPresentation] = useState<typeof errorPresentation | null>(null);
  const visibleErrorPresentation = retryPresentation ?? errorPresentation;
  const showErrorState = !data && (!!effectiveError || isRetryingDetails);

  const retryDetails = async () => {
    setRetryPresentation(errorPresentation);
    setIsRetryingDetails(true);
    try {
      await refetch();
    } finally {
      setIsRetryingDetails(false);
      setRetryPresentation(null);
    }
  };

  const detailPresentation = buildDetailPresentation({
    enriched,
    providerReleaseDate: data?.info?.releaseDate,
    providerCast: data?.info?.cast,
    providerDirector: data?.info?.director,
    providerGenres: data?.info?.genre,
  });
  const { releaseYear, castList, director, genres } = detailPresentation;
  const parsedTitle = parseMediaDisplayTitle(
    data?.info?.name || seriesTitle,
    Number.isFinite(releaseYear) ? String(releaseYear) : undefined,
  );
  const cleanSeriesTitle = parsedTitle.cleanTitle;
  const displayCountry = parsedTitle.country ? countryName(parsedTitle.country, language) : null;
  const plot = enriched?.overview || data?.info?.plot || t('No description available.');
  const rating = enriched?.voteAverage ?? data?.info?.rating;
  const hasMoreDetails = plot.length > 280 || castList.length > 3;
  const resumeHint = [historyItem?.episodeTitle, remainingLabel].filter(Boolean).join(' · ');
  // Real (landscape) backdrop art only — cover/seriesPoster are 2:3 posters,
  // and background-size: cover on this ~4:1 strip would crop one down to a
  // near-arbitrary sliver of itself rather than gracefully letterbox it.
  const backdropUrl = enriched?.backdropUrl || data?.info?.backdrop_path?.[0];
  const resumeProgress = Math.min(100, Math.max(0, historyItem?.progressPercentage || 0));

  const seasons = useMemo(() => {
    return data?.episodes
      ? Object.keys(data.episodes).sort((left, right) => Number(left) - Number(right))
      : [];
  }, [data?.episodes]);

  const seasonSelectOptions = useMemo(() => {
    return seasons.map((s) => ({
      value: s,
      label: t('Season {number}', { number: s }),
    }));
  }, [seasons, t]);

  const displayedSeasonCount = enriched?.numberOfSeasons ?? seasons.length;
  const displayedEpisodeCount =
    enriched?.numberOfEpisodes ??
    Object.values(data?.episodes ?? {}).reduce((count, episodes) => count + episodes.length, 0);

  useEffect(() => {
    setSelectedSeason('');
    positionedEpisodeRef.current = false;
  }, [initialEpisodeNumber, initialSeasonNumber, providerSeriesId]);

  useEffect(() => {
    if (data?.episodes) {
      const availableSeasons = Object.keys(data.episodes);
      if (availableSeasons.length > 0 && !selectedSeason) {
        const requestedSeason = initialSeasonNumber?.toString();
        const savedSeasonStr = historyItem?.seasonNum?.toString();
        if (requestedSeason && availableSeasons.includes(requestedSeason)) {
          setSelectedSeason(requestedSeason);
        } else if (savedSeasonStr && availableSeasons.includes(savedSeasonStr)) {
          setSelectedSeason(savedSeasonStr);
        } else {
          setSelectedSeason(
            [...availableSeasons].sort((left, right) => Number(left) - Number(right))[0] ?? '',
          );
        }
      }
    }
  }, [data, selectedSeason, historyItem?.seasonNum, initialSeasonNumber]);

  const currentEpisodes = useMemo(() => {
    return selectedSeason && data?.episodes ? data.episodes[selectedSeason] || [] : [];
  }, [selectedSeason, data?.episodes]);
  const availableEpisodeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [seasonNumber, episodes] of Object.entries(data?.episodes ?? {})) {
      for (const episode of episodes)
        keys.add(episodeScheduleKey(seasonNumber, episode.episode_num));
    }
    return keys;
  }, [data?.episodes]);

  useEffect(() => {
    if (
      positionedEpisodeRef.current ||
      !initialEpisodeNumber ||
      (initialSeasonNumber && selectedSeason !== String(initialSeasonNumber)) ||
      !initialEpisodeRef.current
    )
      return;
    positionedEpisodeRef.current = true;
    initialEpisodeRef.current.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [currentEpisodes, initialEpisodeNumber, initialSeasonNumber, selectedSeason]);

  const handlePlayEpisode = (
    episode: XtreamEpisode,
    customStartPos?: number,
    seasonOverride = selectedSeason,
  ) => {
    const episodeLibraryId = resolvedSourceId
      ? xtreamItemId(resolvedSourceId, 'episode', episode.id)
      : episode.id.toString();

    let startPosition = customStartPos;
    if (startPosition === undefined) {
      const isSavedEp = historyItem && historyItem.episodeId?.toString() === episode.id.toString();
      startPosition = isSavedEp ? historyItem.currentTime || 0 : 0;
    }

    // A downloaded episode plays straight from disk — instantly, online or
    // offline — skipping the provider stream entirely.
    const downloaded = downloadedByLibraryId[episodeLibraryId];
    if (downloaded) {
      playStream(playableFromDownloadedItem(downloaded, startPosition));
      onClose();
      return;
    }

    const playback = resolveEpisodePlayback(episode, credentials);
    if (!playback) return;

    const parsedEpisode = parseEpisodeTitle(episode.title, {
      seriesTitle: cleanSeriesTitle,
      seasonNum: seasonOverride,
      episodeNum: episode.episode_num,
    });

    playStream({
      id: resolvedSourceId ? xtreamItemId(resolvedSourceId, 'episode', episode.id) : episode.id,
      sourceItemId: episode.id.toString(),
      title: formatEpisodePlaybackTitle(
        cleanSeriesTitle,
        seasonOverride,
        episode.episode_num,
        episode.title,
      ),
      type: 'series',
      ...playback,
      posterUrl: episode.info?.movie_image || seriesPoster,
      seriesPosterUrl: data?.info?.cover || seriesPoster,
      seriesId: seriesId,
      seriesSourceItemId: providerSeriesId,
      seriesTitle: cleanSeriesTitle,
      seasonNum: seasonOverride,
      episodeNum: episode.episode_num,
      episodeTitle: parsedEpisode.cleanTitle,
      startPosition,
      knownDuration: historyItem?.duration,
      tags: mergeMediaTags(...parsedTitle.tags, ...parsedEpisode.tags),
      country: parsedTitle.country ?? parsedEpisode.country,
    });
    onClose();
  };

  const handleDownloadSeason = () => {
    const episodesToDownload: DownloadableMediaItem[] = currentEpisodes.map((episode) => {
      const episodeLibraryId = resolvedSourceId
        ? xtreamItemId(resolvedSourceId, 'episode', episode.id)
        : episode.id.toString();
      const playback = resolveEpisodePlayback(episode, credentials);
      const parsedEpisode = parseEpisodeTitle(episode.title, {
        seriesTitle: cleanSeriesTitle,
        seasonNum: selectedSeason,
        episodeNum: episode.episode_num,
      });
      return {
        id: episodeLibraryId,
        title: formatEpisodePlaybackTitle(
          cleanSeriesTitle,
          selectedSeason,
          episode.episode_num,
          episode.title,
        ),
        type: 'series',
        streamUrl: playback?.streamUrl,
        httpHeaders: playback?.httpHeaders,
        containerExtension: episode.container_extension,
        posterUrl: episode.info?.movie_image || data?.info?.cover || seriesPoster,
        description: episode.info?.plot,
        seriesId,
        seriesSourceItemId: providerSeriesId,
        seriesTitle: cleanSeriesTitle,
        seriesPosterUrl: data?.info?.cover || seriesPoster,
        seasonNum: selectedSeason,
        episodeNum: episode.episode_num,
        episodeTitle: parsedEpisode.cleanTitle,
      };
    });
    downloadSeriesSeason(`Season ${selectedSeason}`, episodesToDownload);
  };

  const handleResumeClick = () => {
    if (!data?.episodes || !historyItem) return;
    const seasonKey = historyItem.seasonNum?.toString() || selectedSeason;
    const eps = data.episodes[seasonKey] || [];
    const targetEp =
      eps.find((episode) => episode.id.toString() === historyItem.episodeId?.toString()) || eps[0];
    if (targetEp) {
      if (seasonKey !== selectedSeason) {
        setSelectedSeason(seasonKey);
      }
      handlePlayEpisode(targetEp, historyItem.currentTime || 0, seasonKey);
    }
  };

  return (
    <DetailsDialogShell
      onClose={onClose}
      labelledBy={data ? titleId : undefined}
      ariaLabel="Series details"
      stateLayout={showErrorState}
    >
      {showErrorState ? (
        <ErrorState
          modal
          title={visibleErrorPresentation.title}
          description={visibleErrorPresentation.description}
          detail={visibleErrorPresentation.detail}
          actionIcon={!error && !credentials ? Settings : undefined}
          actionLabel={error ? 'Try Again' : !credentials ? 'Open Settings' : 'Close'}
          onAction={
            error
              ? () => void retryDetails()
              : !credentials
                ? () => {
                    onClose();
                    navigate('/settings?section=sources');
                  }
                : onClose
          }
          isRetrying={isRetryingDetails || isFetching}
        />
      ) : isLoading ? (
        <SeriesDetailSkeleton />
      ) : data ? (
        <>
          {/* Backdrop hero layer — omitted when no real backdrop art exists. */}
          {backdropUrl && (
            <div className={styles.backdropContainer}>
              <div className={styles.backdrop} style={{ backgroundImage: `url(${backdropUrl})` }} />
              <div className={styles.backdropOverlay} />
            </div>
          )}

          <div className={styles.content}>
            {/* Left: Poster column with cover + action buttons */}
            <div className={`${styles.posterColumn} subtle-scrollbar`}>
              <div className={styles.posterWrapper}>
                {imageError || !(enriched?.posterUrl || data.info?.cover || seriesPoster) ? (
                  <div className={styles.posterPlaceholder}>
                    <MonitorPlay size={44} className={styles.posterPlaceholderIcon} />
                    <span className={styles.posterPlaceholderTitle}>{cleanSeriesTitle}</span>
                  </div>
                ) : (
                  <img
                    src={enriched?.posterUrl || data.info?.cover || seriesPoster}
                    alt={cleanSeriesTitle}
                    className={styles.poster}
                    onError={() => setImageError(true)}
                  />
                )}
              </div>

              {/* Action Buttons below cover */}
              <div className={styles.actionButtons}>
                {historyItem && historyItem.episodeNum ? (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={handleResumeClick}
                    data-modal-primary
                  >
                    <Play size={20} fill="currentColor" />
                    <span className={styles.playBtnLabel}>
                      <span>
                        {t(historyItem.currentTime ? 'Resume' : 'Play')} S{historyItem.seasonNum}:E
                        {historyItem.episodeNum}
                      </span>
                      {resumeHint && <span className={styles.playBtnHint}>{resumeHint}</span>}
                    </span>
                    {resumeProgress > 0 && (
                      <span className={styles.actionProgress} aria-hidden="true">
                        <span
                          className={styles.actionProgressFill}
                          style={{ width: `${resumeProgress}%` }}
                        />
                      </span>
                    )}
                  </button>
                ) : currentEpisodes.length > 0 ? (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={() => {
                      const firstEpisode = currentEpisodes[0];
                      if (firstEpisode) handlePlayEpisode(firstEpisode);
                    }}
                    data-modal-primary
                  >
                    <Play size={20} fill="currentColor" />
                    <span>{t('Start Watching')}</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  className={`${styles.favoriteBtn} ${isFav ? styles.activeFavoriteBtn : ''}`}
                  onClick={toggleFavorite}
                  aria-label={t(isFav ? 'Remove from favorites' : 'Add to favorites')}
                  aria-pressed={isFav}
                >
                  <Heart size={18} fill={isFav ? 'currentColor' : 'none'} />
                  <span>{t(isFav ? 'In Favorites' : 'Add to Favorites')}</span>
                </button>
              </div>
            </div>

            {/* Right: details header, metadata, plot, and season/episode browser */}
            <div className={`${styles.detailsArea} subtle-scrollbar`}>
              <div className={styles.headerBlock}>
                <h1 id={titleId} className={styles.title}>
                  {cleanSeriesTitle}
                </h1>

                <div className={styles.mediaFacts}>
                  {Number.isFinite(releaseYear) && (
                    <span className={styles.factItem}>{releaseYear}</span>
                  )}
                  {enriched?.runtimeMinutes && (
                    <span className={styles.factItem}>
                      <Clock size={14} />{' '}
                      {language === 'en'
                        ? `${number(enriched.runtimeMinutes)}m`
                        : t('{count} min', { count: number(enriched.runtimeMinutes) })}
                    </span>
                  )}
                  {rating !== null && rating !== undefined && rating !== '' && (
                    <span className={styles.factItem}>
                      <Star size={14} fill="currentColor" className={styles.starIcon} /> {rating}
                    </span>
                  )}
                  {genres && <span className={styles.factItem}>{genres}</span>}
                  {displayedSeasonCount > 0 && (
                    <span className={styles.factItem}>
                      {tn('{count} season', '{count} seasons', displayedSeasonCount, {
                        count: number(displayedSeasonCount),
                      })}
                    </span>
                  )}
                  {displayedEpisodeCount > 0 && (
                    <span className={styles.factItem}>
                      {tn('{count} episode', '{count} episodes', displayedEpisodeCount, {
                        count: number(displayedEpisodeCount),
                      })}
                    </span>
                  )}
                  {displayCountry && <span className={styles.factItem}>{displayCountry}</span>}
                  {getPrimaryMediaTags(parsedTitle.tags).map((tag) => (
                    <span
                      key={tag}
                      className={`${styles.factItem} ${styles.technicalFact}`}
                      data-tag-type={getTagColorType(tag)}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className={`${styles.plot} ${detailsExpanded ? styles.expandedText : styles.collapsedText}`}
              >
                {plot}
              </div>

              {hasMoreDetails && (
                <button
                  type="button"
                  className={styles.detailsToggle}
                  onClick={() => setDetailsExpanded((expanded) => !expanded)}
                  aria-expanded={detailsExpanded}
                >
                  {detailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {t(detailsExpanded ? 'Show less' : 'More details')}
                </button>
              )}

              {/* Episodes Section */}
              <section className={styles.episodeSection} aria-label={t('Episodes')}>
                <div className={styles.episodeBrowserHeader}>
                  {seasons.length > 0 ? (
                    <Select
                      value={selectedSeason}
                      options={seasonSelectOptions}
                      onChange={setSelectedSeason}
                      width={180}
                    />
                  ) : null}

                  {currentEpisodes.length > 0 && (
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
                  {currentEpisodes.map((episode) => {
                    const episodeLibraryId = resolvedSourceId
                      ? xtreamItemId(resolvedSourceId, 'episode', episode.id)
                      : episode.id.toString();
                    const parsedEpisode = parseEpisodeTitle(episode.title, {
                      seriesTitle: cleanSeriesTitle,
                      seasonNum: selectedSeason,
                      episodeNum: episode.episode_num,
                    });
                    const epTitle = formatEpisodePlaybackTitle(
                      cleanSeriesTitle,
                      selectedSeason,
                      episode.episode_num,
                      episode.title,
                    );
                    const episodeItem = {
                      id: episodeLibraryId,
                      sourceItemId: episode.id.toString(),
                      title: epTitle,
                      posterUrl: episode.info?.movie_image || data.info?.cover || seriesPoster,
                      type: 'series' as const,
                      streamUrl: resolveEpisodePlayback(episode, credentials)?.streamUrl || '',
                      httpHeaders: episode.http_headers,
                      sourceId: episode.source_id,
                      description: episode.info?.plot,
                      seriesId,
                      seriesSourceItemId: providerSeriesId,
                      seriesTitle: cleanSeriesTitle,
                      seriesPosterUrl: data.info?.cover || seriesPoster,
                      seasonNum: selectedSeason,
                      episodeNum: episode.episode_num,
                      episodeTitle: parsedEpisode.cleanTitle,
                    };

                    const isSavedEp =
                      historyItem && historyItem.episodeId?.toString() === episode.id.toString();
                    const epProgress = isSavedEp
                      ? Math.min(100, Math.max(0, historyItem.progressPercentage))
                      : 0;
                    const isWatched = watchedIds.includes(episodeLibraryId);
                    const isDownloaded = Boolean(downloadedByLibraryId[episodeLibraryId]);
                    const durationLabel = formatDurationLabel(
                      episode.info?.duration,
                      episode.info?.duration_secs,
                    );
                    const episodeStatus =
                      isSavedEp && epProgress > 0
                        ? remainingLabel
                        : isWatched
                          ? t('Watched')
                          : null;
                    const episodeLabel = [
                      t('Season {season}, episode {episode}', {
                        season: selectedSeason,
                        episode: episode.episode_num,
                      }),
                      parsedEpisode.cleanTitle,
                      durationLabel,
                      episodeStatus,
                    ]
                      .filter(Boolean)
                      .join(', ');
                    const isRequestedEpisode =
                      initialEpisodeNumber === Number(episode.episode_num) &&
                      (!initialSeasonNumber || String(initialSeasonNumber) === selectedSeason);

                    return (
                      <button
                        type="button"
                        key={episode.id}
                        ref={isRequestedEpisode ? initialEpisodeRef : undefined}
                        className={`${styles.episodeCard} ${isSavedEp && epProgress > 0 ? styles.currentEpisodeCard : ''} ${isRequestedEpisode ? styles.requestedEpisodeCard : ''}`}
                        onClick={() => handlePlayEpisode(episode)}
                        onContextMenu={(e) =>
                          handleMediaCardContextMenu(e, episodeItem, {
                            onPlay: () => handlePlayEpisode(episode),
                          })
                        }
                        aria-label={episodeLabel}
                        aria-current={isRequestedEpisode ? 'true' : undefined}
                      >
                        <div className={styles.episodeImageWrapper}>
                          <img
                            src={episode.info?.movie_image || data.info?.cover || seriesPoster}
                            alt=""
                            className={styles.episodeImage}
                            loading="lazy"
                          />
                          <div className={styles.playOverlay} aria-hidden="true">
                            <div className={styles.playCircle}>
                              <Play size={20} fill="currentColor" />
                            </div>
                          </div>
                          {isDownloaded && (
                            <span className={styles.episodeDownloadedBadge} title={t('Downloaded')}>
                              <HardDriveDownload size={13} />
                            </span>
                          )}
                          {(isWatched || epProgress > 0) && (
                            <span
                              className={`${styles.episodeProgress} ${isWatched ? styles.watchedEpisodeProgress : ''}`}
                              aria-hidden="true"
                            >
                              <span
                                className={styles.episodeProgressFill}
                                style={{ width: `${isWatched ? 100 : epProgress}%` }}
                              />
                            </span>
                          )}
                        </div>

                        <div className={styles.episodeInfo}>
                          <div className={styles.episodeHeaderLine}>
                            <span className={styles.episodeBadge}>E{episode.episode_num}</span>
                            <span className={styles.episodeTitle}>{parsedEpisode.cleanTitle}</span>
                          </div>
                          {episode.info?.plot && (
                            <p className={styles.episodePlot}>{episode.info.plot}</p>
                          )}
                          <div className={styles.episodeMeta}>
                            {durationLabel && <span>{durationLabel}</span>}
                            {episodeStatus && (
                              <span
                                className={`${styles.episodeStatus} ${isWatched && !isSavedEp ? styles.watchedStatus : ''}`}
                              >
                                {isWatched && !isSavedEp && <CheckCircle2 size={13} />}
                                {episodeStatus}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {currentEpisodes.length === 0 && (
                    <div className={styles.emptyEpisodes}>
                      {t('No episodes available for this season.')}
                    </div>
                  )}
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

              {/* Director & Cast Credits */}
              {(director || castList.length > 0) && (
                <div className={styles.creditsSection}>
                  {director && (
                    <div className={styles.creditBlock}>
                      <span className={styles.creditLabel}>{t('Director')}</span>
                      <span className={styles.creditValue}>{director}</span>
                    </div>
                  )}
                  {castList.length > 0 && (
                    <div className={styles.creditBlock}>
                      <span className={styles.creditLabel}>{t('Cast')}</span>
                      <div className={styles.castTags}>
                        {(detailsExpanded ? castList : castList.slice(0, 6)).map((actor, idx) => (
                          <span key={idx} className={styles.castTag}>
                            {actor}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </DetailsDialogShell>
  );
}
