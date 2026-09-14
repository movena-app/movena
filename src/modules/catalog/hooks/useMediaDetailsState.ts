import { useState, useCallback } from 'react';
import type { MediaItem, MediaOpenContext } from '../model/media';
import {
  useAuthStore,
  getLegacyXtreamSourceId,
  selectPrimaryXtreamCredentials,
} from '@/modules/sources/public/store/useAuthStore';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { useSourceStore } from '@/modules/sources/public/store/useSourceStore';
import { useDownloadStore } from '@/modules/downloads/public/store/useDownloadStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import {
  playableFromDownloadedItem,
  playableFromMediaItem,
} from '@/modules/playback/public/lib/playback';

export interface UseMediaDetailStateOptions {
  enableSourceOnOpen?: boolean | undefined;
}

export function useMediaDetailState(options: UseMediaDetailStateOptions = {}) {
  const { enableSourceOnOpen = false } = options;
  const [selectedMovie, setSelectedMovie] = useState<MediaItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<MediaItem | null>(null);

  const credentials = useAuthStore(selectPrimaryXtreamCredentials);
  const playStream = usePlayerStore((state) => state.playStream);

  const handleCloseMovie = useCallback(() => {
    setSelectedMovie(null);
  }, []);

  const handleCloseSeries = useCallback(() => {
    setSelectedSeries(null);
  }, []);

  const handleCloseAll = useCallback(() => {
    setSelectedMovie(null);
    setSelectedSeries(null);
  }, []);

  const handleItemClick = useCallback(
    (item: MediaItem, context?: MediaOpenContext) => {
      if (enableSourceOnOpen) {
        const sourceId =
          item.sourceId && item.sourceId !== 'xtream'
            ? item.sourceId
            : item.type === 'vod' || item.type === 'series'
              ? getLegacyXtreamSourceId()
              : undefined;
        if (sourceId) {
          useSourceStore.getState().setSourceEnabled(sourceId, true);
        }
      }

      if (item.type === 'series') {
        setSelectedMovie(null);
        setSelectedSeries(
          context
            ? {
                ...item,
                seasonNum: context.seasonNumber ?? item.seasonNum,
                episodeNum: context.episodeNumber ?? item.episodeNum,
              }
            : item,
        );
      } else if (item.type === 'vod') {
        // A downloaded movie plays straight from disk — instantly, online or
        // offline, exactly like the rest of the catalog would only wish it
        // could. Skip the detail modal (and its provider/TMDB fetches)
        // entirely, the same way the `live` branch below skips it.
        const downloaded = useDownloadStore.getState().downloadedByLibraryId[item.id];
        if (downloaded) {
          setSelectedMovie(null);
          setSelectedSeries(null);
          const resumeSeconds = useLibraryStore
            .getState()
            .history.find((entry) => entry.id === item.id)?.currentTime;
          playStream(playableFromDownloadedItem(downloaded, resumeSeconds));
          return;
        }
        setSelectedSeries(null);
        setSelectedMovie(item);
      } else if (item.type === 'live') {
        setSelectedMovie(null);
        setSelectedSeries(null);
        const playable = playableFromMediaItem(item, credentials);
        if (playable) {
          playStream(playable);
        }
      }
    },
    [credentials, enableSourceOnOpen, playStream],
  );

  return {
    selectedMovie,
    selectedSeries,
    setSelectedMovie,
    setSelectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleCloseAll,
    handleItemClick,
  };
}
