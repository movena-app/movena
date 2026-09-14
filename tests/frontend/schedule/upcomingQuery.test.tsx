// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmdb = vi.hoisted(() => ({
  searchTmdb: vi.fn(),
  getTmdbMovie: vi.fn(),
  getTmdbTv: vi.fn(),
}));
const tvmaze = vi.hoisted(() => ({
  searchTvmazeShows: vi.fn(),
  getTvmazeEpisodes: vi.fn(),
  getTvmazeUpcomingEpisodes: vi.fn(),
}));

vi.mock('@/modules/metadata/data/tmdbClient', () => tmdb);
vi.mock('@/modules/metadata/data/tvMazeClient', () => tvmaze);

import {
  selectUpcomingTmdbMatch,
  useUpcomingReleases,
} from '@/modules/guide/data/useUpcomingReleases';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

it('selects the matching TMDB title and year instead of the first result', () => {
  const match = selectUpcomingTmdbMatch({ title: 'The Office', year: '2005' }, 'tv', [
    { id: 1, mediaType: 'tv', title: 'The Office', releaseYear: '2001' },
    { id: 2, mediaType: 'tv', title: 'The Office', releaseYear: '2005' },
    { id: 3, mediaType: 'movie', title: 'The Office', releaseYear: '2005' },
  ]);
  expect(match?.id).toBe(2);
});

function wrapperFactory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({
    favorites: [
      { id: 'series-1', title: 'Example Show', posterUrl: 'favorite.jpg', type: 'series' },
    ],
    collections: [],
    history: [],
    watched: [],
  });
  useSettingsStore.setState({
    language: 'en',
    tmdbEnabled: true,
    tmdbApiKey: 'test-key',
    tmdbLanguage: 'en-US',
    tmdbIncludeAdult: false,
    tmdbImageSize: 'w500',
    upcomingEnabled: true,
    upcomingExactTimesEnabled: true,
  });
  tmdb.searchTmdb.mockResolvedValue({
    results: [{ id: 77, mediaType: 'tv', title: 'Example Show' }],
  });
  tmdb.getTmdbTv.mockResolvedValue({ posterUrl: 'tmdb.jpg', nextEpisodeToAir: null });
  tvmaze.searchTvmazeShows.mockResolvedValue([{ id: 9, name: 'Example Show', externals: {} }]);
  tvmaze.getTvmazeEpisodes.mockResolvedValue([
    {
      id: 101,
      name: 'First',
      seasonNumber: 2,
      episodeNumber: 1,
      airstamp: '2030-01-02T20:00:00+01:00',
    },
    {
      id: 102,
      name: 'Second',
      seasonNumber: 2,
      episodeNumber: 2,
      airstamp: '2030-01-09T20:00:00+01:00',
    },
  ]);
});

describe('upcoming release query', () => {
  it('can scope modal lookups to one favorite without querying the rest of the library', async () => {
    useLibraryStore.setState({
      favorites: [
        { id: 'series-1', title: 'Example Show', posterUrl: '', type: 'series' },
        { id: 'series-2', title: 'Other Show', posterUrl: '', type: 'series' },
      ],
    });

    const { result } = renderHook(() => useUpcomingReleases({ favoriteIds: ['series-1'] }), {
      wrapper: wrapperFactory(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tmdb.searchTmdb).toHaveBeenCalledTimes(1);
    expect(tmdb.searchTmdb).toHaveBeenCalledWith(
      'test-key',
      'Example Show',
      undefined,
      expect.any(Object),
    );
  });

  it('expands one favorite into every announced future TVmaze episode', async () => {
    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: wrapperFactory() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject([
      {
        title: 'First',
        seasonNumber: 2,
        episodeNumber: 1,
        exactAirTime: '2030-01-02T20:00:00+01:00',
      },
      {
        title: 'Second',
        seasonNumber: 2,
        episodeNumber: 2,
        exactAirTime: '2030-01-09T20:00:00+01:00',
      },
    ]);
    expect(tvmaze.getTvmazeEpisodes).toHaveBeenCalledTimes(1);
  });

  it('keeps recently aired TVmaze episodes inside the configured window', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(20, 0, 0, 0);
    const airDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    tvmaze.getTvmazeEpisodes.mockResolvedValue([
      {
        id: 100,
        name: 'Just Aired',
        seasonNumber: 2,
        episodeNumber: 0,
        airstamp: yesterday.toISOString(),
      },
    ]);

    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: wrapperFactory() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject([
      { title: 'Just Aired', airDate, timeSource: 'tvmaze' },
    ]);
  });

  it('keeps the TMDB next-episode fallback when exact schedules are disabled', async () => {
    useSettingsStore.setState({ upcomingExactTimesEnabled: false });
    tmdb.getTmdbTv.mockResolvedValue({
      posterUrl: 'tmdb.jpg',
      nextEpisodeToAir: {
        name: 'TMDB Next',
        airDate: '2030-03-04',
        seasonNumber: 3,
        episodeNumber: 1,
        stillUrl: null,
      },
    });
    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: wrapperFactory() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject([
      { title: 'TMDB Next', exactAirTime: null, timeSource: 'tmdb' },
    ]);
    expect(tvmaze.searchTvmazeShows).not.toHaveBeenCalled();
    expect(tvmaze.getTvmazeEpisodes).not.toHaveBeenCalled();
  });

  it('keeps the latest TMDB episode after it airs when exact schedules are disabled', async () => {
    useSettingsStore.setState({ upcomingExactTimesEnabled: false, upcomingHistoryDays: 7 });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const airDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    tmdb.getTmdbTv.mockResolvedValue({
      posterUrl: 'tmdb.jpg',
      nextEpisodeToAir: null,
      lastEpisodeToAir: {
        id: 90,
        name: 'Just Aired',
        airDate,
        seasonNumber: 4,
        episodeNumber: 2,
        stillUrl: null,
      },
    });

    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: wrapperFactory() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject([
      { title: 'Just Aired', airDate, timeSource: 'tmdb' },
    ]);
  });
});
