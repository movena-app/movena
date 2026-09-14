// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore, type WatchProgress } from '@/modules/library/store/useLibraryStore';
import { useNotificationStore } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const movie = { id: 'movie-1', title: 'Movie', posterUrl: 'poster', type: 'vod' as const };

const progress = (overrides: Partial<WatchProgress> = {}): WatchProgress => ({
  id: 'movie-1',
  title: 'Movie',
  posterUrl: 'poster',
  type: 'vod',
  currentTime: 200,
  duration: 1000,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useNotificationStore.setState({ notifications: [] });
  useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
  vi.setSystemTime(new Date('2026-08-10T12:00:00Z'));
});

describe('library store', () => {
  it('deduplicates favorites and toggles watched state', () => {
    const store = useLibraryStore.getState();
    store.addFavorite(movie);
    store.addFavorite(movie);
    store.toggleWatched(movie.id);

    expect(useLibraryStore.getState().favorites).toEqual([movie]);
    expect(useLibraryStore.getState().isWatched(movie.id)).toBe(true);
    useLibraryStore.getState().toggleWatched(movie.id);
    expect(useLibraryStore.getState().isWatched(movie.id)).toBe(false);
  });

  it('ignores accidental starts without overwriting a real resume point', () => {
    useLibraryStore.getState().updateHistory(progress());
    useLibraryStore.getState().updateHistory(progress({ currentTime: 10 }));

    expect(useLibraryStore.getState().history[0]).toMatchObject({
      id: 'movie-1',
      currentTime: 200,
      progressPercentage: 20,
    });
  });

  it('marks completed movies watched and removes their resume card', () => {
    useLibraryStore.getState().updateHistory(progress());
    useLibraryStore.getState().updateHistory(progress({ currentTime: 900 }));

    expect(useLibraryStore.getState().history).toEqual([]);
    expect(useLibraryStore.getState().watched).toContain('movie-1');
  });

  it('groups series history by series and advances completed episodes', () => {
    useLibraryStore.getState().updateHistory(
      progress({
        id: 'episode-1',
        seriesId: 'series-1',
        type: 'series',
        title: 'Series',
        seasonNum: 1,
        episodeNum: 1,
        episodeTitle: 'Pilot',
        currentTime: 900,
        nextEpisode: { id: 'episode-2', seasonNum: 1, episodeNum: 2, episodeTitle: 'Next' },
      }),
    );

    expect(useLibraryStore.getState().history).toHaveLength(1);
    expect(useLibraryStore.getState().history[0]).toMatchObject({
      id: 'series-1',
      episodeId: 'episode-2',
      seasonNum: 1,
      episodeNum: 2,
      currentTime: 0,
      progressPercentage: 0,
    });
    expect(useLibraryStore.getState().watched).toContain('episode-1');
  });

  it('retains direct playlist playback data without leaking it into identifiers', () => {
    useLibraryStore.getState().updateHistory(
      progress({
        id: 'm3u-item',
        streamUrl: 'https://stream.test/movie?token=secret',
        httpHeaders: { Referer: 'https://portal.test/' },
        sourceId: 'm3u-source',
      }),
    );

    expect(useLibraryStore.getState().history[0]).toMatchObject({
      id: 'm3u-item',
      streamUrl: 'https://stream.test/movie?token=secret',
      httpHeaders: { Referer: 'https://portal.test/' },
      sourceId: 'm3u-source',
    });
    const persisted = localStorage.getItem('iptv-library-storage') ?? '';
    expect(persisted).not.toContain('stream.test');
    expect(persisted).not.toContain('portal.test');
    expect(persisted).not.toContain('secret');
  });

  it('caps history items to MAX_HISTORY_ITEMS (200) to prevent unbounded memory growth', () => {
    for (let i = 0; i < 250; i++) {
      useLibraryStore.getState().updateHistory(
        progress({
          id: `movie-${i}`,
          title: `Movie ${i}`,
          currentTime: 50,
          duration: 1000,
        }),
      );
    }

    expect(useLibraryStore.getState().history).toHaveLength(200);
    expect(useLibraryStore.getState().history[0]!.id).toBe('movie-249');
  });
});
