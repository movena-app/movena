import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { detailQueryKeys } from '@/modules/catalog/public/data/useDetails';
import {
  useLibraryStore,
  type WatchProgress,
} from '@/modules/library/public/store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { findNextEpisode, type SeriesEpisodesBySeason } from '../lib/seriesNavigation';
import {
  getSeriesBaseTitle,
  parseEpisodeTitle,
  parseMediaTitle,
} from '@/modules/catalog/public/lib/titleParser';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { getXtreamQueryScope } from '@/modules/sources/public/model/queryKeys';

export function useWatchProgress() {
  const activeStream = usePlayerStore((state) => state.activeStream);
  const updateHistory = useLibraryStore((state) => state.updateHistory);
  const credentials = useAuthStore((state) =>
    activeStream?.sourceId
      ? (state.runtimes[activeStream.sourceId]?.credentials ?? null)
      : getXtreamCredentials(),
  );
  const queryClient = useQueryClient();
  const authScope = getXtreamQueryScope(activeStream?.sourceId, credentials);
  const lastSaveTimeRef = useRef(0);

  const saveCurrentProgress = useCallback(() => {
    const state = usePlayerStore.getState();
    const stream = state.activeStream;
    if (!stream || (stream.type !== 'vod' && stream.type !== 'series') || state.duration <= 0)
      return;

    let nextEpisode: WatchProgress['nextEpisode'];
    if (stream.type === 'series' && stream.seriesId) {
      const seriesData = queryClient.getQueryData<{
        episodes?: SeriesEpisodesBySeason | undefined;
      }>(detailQueryKeys.series(stream.seriesSourceItemId || stream.seriesId, authScope));
      const next = findNextEpisode(
        seriesData?.episodes,
        stream.sourceItemId || stream.id,
        stream.seasonNum,
      );
      if (next) {
        const parsedNextEpisode = parseEpisodeTitle(next.episode.title, {
          seriesTitle: stream.seriesTitle || getSeriesBaseTitle(stream.title),
          seasonNum: next.seasonNum,
          episodeNum: next.episode.episode_num,
        });
        nextEpisode = {
          id: next.episode.id.toString(),
          seasonNum: next.seasonNum,
          episodeNum: next.episode.episode_num,
          episodeTitle: parsedNextEpisode.cleanTitle,
          streamUrl: next.episode.stream_url,
          httpHeaders: next.episode.http_headers,
          sourceId: next.episode.source_id,
        };
      }
    }

    const cleanPlaybackTitle = parseMediaTitle(stream.title).cleanTitle;
    const seriesTitle =
      stream.type === 'series'
        ? stream.seriesTitle || getSeriesBaseTitle(stream.title)
        : cleanPlaybackTitle;
    updateHistory({
      id: stream.id.toString(),
      seriesId: stream.seriesId?.toString(),
      title: seriesTitle,
      posterUrl:
        (stream.type === 'series' ? stream.seriesPosterUrl : undefined) || stream.posterUrl || '',
      type: stream.type,
      currentTime: state.currentTime,
      duration: state.duration,
      tags: stream.tags,
      country: stream.country,
      streamUrl: stream.streamUrl,
      httpHeaders: stream.httpHeaders,
      sourceId: stream.sourceId,
      sourceItemId: stream.sourceItemId,
      seriesSourceItemId: stream.seriesSourceItemId?.toString(),
      seasonNum: stream.seasonNum,
      episodeNum: stream.episodeNum,
      episodeTitle:
        stream.type === 'series'
          ? stream.episodeTitle ||
            parseEpisodeTitle(stream.title, {
              seriesTitle,
              seasonNum: stream.seasonNum,
              episodeNum: stream.episodeNum,
            }).cleanTitle
          : undefined,
      nextEpisode,
    });
  }, [authScope, queryClient, updateHistory]);

  useEffect(() => {
    if (!activeStream || (activeStream.type !== 'vod' && activeStream.type !== 'series')) return;
    const unsubscribe = usePlayerStore.subscribe((state) => {
      const now = Date.now();
      if (now - lastSaveTimeRef.current > 3000 && state.currentTime > 0 && state.duration > 0) {
        lastSaveTimeRef.current = now;
        saveCurrentProgress();
      }
    });

    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveCurrentProgress();
    };
    const saveBeforeUnload = () => saveCurrentProgress();
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('beforeunload', saveBeforeUnload);

    return () => {
      saveCurrentProgress();
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('beforeunload', saveBeforeUnload);
      unsubscribe();
    };
  }, [activeStream, saveCurrentProgress]);

  return saveCurrentProgress;
}
