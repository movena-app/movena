import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Select } from '@/shared/ui/Select';
import { usePlayerStore } from '../store/usePlayerStore';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import type { XtreamEpisode } from '@/modules/sources/public/data/xtreamClient';
import { useSeriesInfo } from '@/modules/catalog/public/data/useDetails';
import { useMediaContextMenus } from '@/modules/catalog/public/hooks/useMediaContextMenus';
import styles from './EpisodesDrawer.module.css';
import { resolveEpisodePlayback } from '../lib/playback';
import {
  formatEpisodePlaybackTitle,
  getSeriesBaseTitle,
  parseEpisodeTitle,
} from '@/modules/catalog/public/lib/titleParser';
import { mergeMediaTags } from '@/shared/lib/mediaTags';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import { xtreamItemId } from '@/modules/sources/public/lib/sourceIdentity';
import drawerStyles from './PlayerDrawer.module.css';
import { useI18n } from '@/shared/i18n/i18n';

export function EpisodesDrawer() {
  const { t, number } = useI18n();
  const { handleMediaCardContextMenu } = useMediaContextMenus();
  const showEpisodesDrawer = usePlayerStore((s) => s.showEpisodesDrawer);
  const setShowEpisodesDrawer = usePlayerStore((s) => s.setShowEpisodesDrawer);
  const activeStream = usePlayerStore((s) => s.activeStream);
  const playStream = usePlayerStore((s) => s.playStream);
  const credentials = useAuthStore((s) =>
    activeStream?.sourceId
      ? (s.runtimes[activeStream.sourceId]?.credentials ?? null)
      : getXtreamCredentials(),
  );

  const [selectedSeason, setSelectedSeason] = useState<string>('');

  const isSeries = activeStream?.type === 'series';

  // ── Fetch series data ───────────────────────────────────────

  const { data: seriesData, isLoading } = useSeriesInfo(
    activeStream?.seriesSourceItemId || activeStream?.seriesId,
    activeStream?.sourceId,
    isSeries && showEpisodesDrawer,
  );

  // ── Sync selected season with series data ───────────────────

  useEffect(() => {
    if (seriesData?.episodes) {
      const seasonsList = Object.keys(seriesData.episodes);
      if (seasonsList.length > 0) {
        const currentSeasonStr = activeStream?.seasonNum?.toString();
        setSelectedSeason((selected) => {
          if (selected && seasonsList.includes(selected)) return selected;
          if (currentSeasonStr && seasonsList.includes(currentSeasonStr)) return currentSeasonStr;
          return seasonsList[0] ?? '';
        });
      }
    }
  }, [seriesData, activeStream?.seasonNum]);

  // ── Don't render for non-series ─────────────────────────────

  if (!isSeries || !showEpisodesDrawer) return null;

  // ── Derived data ────────────────────────────────────────────

  const seasons = seriesData?.episodes ? Object.keys(seriesData.episodes) : [];
  const currentEpisodes =
    selectedSeason && seriesData?.episodes ? seriesData.episodes[selectedSeason] || [] : [];
  const cleanSeriesTitle =
    getSeriesBaseTitle(seriesData?.info?.name || activeStream.seriesTitle || activeStream.title) ||
    t('Series');

  // ── Play a specific episode ─────────────────────────────────

  const playEpisode = (episode: XtreamEpisode, seasonNum: string) => {
    if (!activeStream?.seriesId) return;
    const playback = resolveEpisodePlayback(episode, credentials);
    if (!playback) return;
    const parsedEpisode = parseEpisodeTitle(episode.title, {
      seriesTitle: cleanSeriesTitle,
      seasonNum,
      episodeNum: episode.episode_num,
    });

    const historyItem = useLibraryStore
      .getState()
      .history.find((item) => item.id === activeStream.seriesId?.toString());
    const isSavedEp = historyItem && historyItem.episodeId?.toString() === episode.id.toString();

    playStream({
      id: activeStream.sourceId?.startsWith('xtream-')
        ? xtreamItemId(activeStream.sourceId, 'episode', episode.id)
        : episode.id,
      sourceItemId: episode.id.toString(),
      title: formatEpisodePlaybackTitle(
        cleanSeriesTitle,
        seasonNum,
        episode.episode_num,
        episode.title,
      ),
      type: 'series',
      ...playback,
      posterUrl: episode.info?.movie_image || activeStream.posterUrl,
      // Carry the show's artwork across an episode switch, so Continue Watching
      // does not fall back to the new episode's still.
      seriesPosterUrl: activeStream.seriesPosterUrl,
      seriesId: activeStream.seriesId,
      seriesSourceItemId: activeStream.seriesSourceItemId,
      seriesTitle: cleanSeriesTitle,
      seasonNum: seasonNum,
      episodeNum: episode.episode_num,
      episodeTitle: parsedEpisode.cleanTitle,
      tags: mergeMediaTags(...(activeStream.tags ?? []), ...parsedEpisode.tags),
      country: activeStream.country ?? parsedEpisode.country,
      startPosition: isSavedEp ? historyItem.currentTime || 0 : 0,
      knownDuration: isSavedEp ? historyItem.duration : undefined,
    });
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {showEpisodesDrawer && (
        <motion.div
          className={drawerStyles.drawer}
          data-ui-layer="player-popover"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={drawerStyles.header}>
            <div className={drawerStyles.headerTitleRow}>
              <span className={drawerStyles.headerTitle}>{cleanSeriesTitle}</span>
              <button
                type="button"
                className={drawerStyles.iconBtn}
                onClick={() => setShowEpisodesDrawer(false)}
                aria-label={t('Close Episodes')}
              >
                <X size={20} />
              </button>
            </div>
            <Select
              value={selectedSeason}
              options={seasons.map((season) => ({
                value: season,
                label: t('Season {number}', { number: season }),
              }))}
              onChange={setSelectedSeason}
              disabled={seasons.length === 0}
              width="100%"
              variant="player"
            />
          </div>

          {/* Episodes list */}
          <div className={`${drawerStyles.list} subtle-scrollbar`}>
            {isLoading ? (
              <div className={styles.episodesLoading}>{t('Loading episodes...')}</div>
            ) : currentEpisodes.length === 0 ? (
              <div className={styles.episodesEmpty}>{t('No episodes found.')}</div>
            ) : (
              currentEpisodes.map((episode) => {
                const isActive =
                  episode.id.toString() ===
                  (activeStream.sourceItemId || activeStream.id).toString();
                const parsedEpisode = parseEpisodeTitle(episode.title, {
                  seriesTitle: cleanSeriesTitle,
                  seasonNum: selectedSeason,
                  episodeNum: episode.episode_num,
                });

                const epItem = {
                  id: activeStream.sourceId?.startsWith('xtream-')
                    ? xtreamItemId(activeStream.sourceId, 'episode', episode.id)
                    : episode.id.toString(),
                  sourceItemId: episode.id.toString(),
                  title: formatEpisodePlaybackTitle(
                    cleanSeriesTitle,
                    selectedSeason,
                    episode.episode_num,
                    episode.title,
                  ),
                  posterUrl: episode.info?.movie_image || activeStream.posterUrl || '',
                  type: 'series' as const,
                  streamUrl: resolveEpisodePlayback(episode, credentials)?.streamUrl || '',
                  httpHeaders: episode.http_headers,
                  sourceId: episode.source_id,
                };

                return (
                  <button
                    type="button"
                    key={episode.id}
                    className={`${drawerStyles.row} ${isActive ? drawerStyles.rowActive : ''}`}
                    aria-current={isActive ? 'true' : undefined}
                    disabled={isActive}
                    onClick={isActive ? undefined : () => playEpisode(episode, selectedSeason)}
                    onContextMenu={
                      isActive
                        ? undefined
                        : (e) =>
                            handleMediaCardContextMenu(e, epItem, {
                              onPlay: () => playEpisode(episode, selectedSeason),
                            })
                    }
                  >
                    <span className={drawerStyles.rowIndex}>{episode.episode_num}</span>
                    <div className={styles.thumbnailContainer}>
                      <img
                        src={episode.info?.movie_image || activeStream.posterUrl}
                        alt=""
                        loading="lazy"
                        className={styles.episodeThumbnail}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                    </div>
                    <span className={drawerStyles.rowTitle}>{parsedEpisode.cleanTitle}</span>
                    {(episode.info?.duration || episode.info?.duration_secs) && (
                      <span className={drawerStyles.rowMeta}>
                        {episode.info.duration ||
                          t('{count} min', {
                            count: number(Math.round(episode.info.duration_secs! / 60)),
                          })}
                      </span>
                    )}
                    {isActive && (
                      <span className={drawerStyles.nowPlayingDot} aria-label={t('Now playing')} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
