// @vitest-environment happy-dom

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntroDbSegments } from '@/modules/playback/data/useIntroDb';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const tmdb = vi.hoisted(() => ({
  searchTmdbTitles: vi.fn(),
  getTmdbMovie: vi.fn(),
  getTmdbTv: vi.fn(),
  getTmdbTvExternalIds: vi.fn(),
}));
const tvmaze = vi.hoisted(() => ({ searchTvmazeShows: vi.fn(), getTvmazeEpisodes: vi.fn() }));
const native = vi.hoisted(() => ({ introDbFetchSegments: vi.fn() }));
vi.mock('@/modules/metadata/data/tmdbClient', () => tmdb);
vi.mock('@/modules/metadata/data/tvMazeClient', () => tvmaze);
vi.mock('@/platform/tauri', () => ({ tauriApi: native }));

const intro = { start_sec: 77, end_sec: 94, confidence: 1 };

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function show(name: string, imdb: string | null, premieredYear: number | null) {
  return { id: name.length, name, premieredYear, externals: { imdb, thetvdb: null, tvrage: null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.getState().resetSettings();
  useSettingsStore.setState({ language: 'de', introDbEnabled: true, tmdbEnabled: false });
  native.introDbFetchSegments.mockResolvedValue({ intro, recap: null, outro: null });
});

describe('useIntroDbSegments series lookup', () => {
  it('finds a translated title through TMDB and its IMDb id', async () => {
    useSettingsStore.setState({ tmdbEnabled: true, tmdbApiKey: 'key' });
    tmdb.searchTmdbTitles.mockResolvedValue({
      results: [
        {
          id: 71446,
          mediaType: 'tv',
          title: 'Haus des Geldes',
          originalTitle: 'La casa de papel',
          releaseYear: 2017,
          voteAverage: 8.2,
          voteCount: 19000,
          genreIds: [80],
        },
      ],
    });
    tmdb.getTmdbTvExternalIds.mockResolvedValue({ imdbId: 'tt6468322' });

    const { result } = renderHook(
      () => useIntroDbSegments({ title: 'DE - Haus des Geldes', year: 2017 }, '2', 3),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.data?.intro).toEqual({ startSec: 77, endSec: 94 }));
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledWith(
      'key',
      'tv',
      'Haus des Geldes',
      2017,
      undefined,
      expect.objectContaining({ language: 'de-DE' }),
    );
    expect(native.introDbFetchSegments).toHaveBeenCalledWith('tt6468322', 2, 3);
    expect(tvmaze.searchTvmazeShows).not.toHaveBeenCalled();
  });

  it('takes the TVmaze show whose name and year match, not the first with an IMDb id', async () => {
    tvmaze.searchTvmazeShows.mockResolvedValue([
      show('Dark Matter', 'tt4159076', 2015),
      show('Dark', 'tt5753856', 2017),
    ]);

    const { result } = renderHook(() => useIntroDbSegments({ title: 'Dark', year: 2017 }, 1, 1), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(native.introDbFetchSegments).toHaveBeenCalledWith('tt5753856', 1, 1);
  });

  it('asks IntroDB nothing when no show is this series', async () => {
    tvmaze.searchTvmazeShows.mockResolvedValue([show('Something Else', 'tt0000001', 2001)]);

    const { result } = renderHook(() => useIntroDbSegments({ title: 'Dark' }, 1, 1), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ intro: null, recap: null, outro: null });
    expect(native.introDbFetchSegments).not.toHaveBeenCalled();
  });

  it('fails instead of remembering "no timestamps" when the lookup could not run', async () => {
    tvmaze.searchTvmazeShows.mockRejectedValue(new Error('TVmaze request failed (HTTP 503)'));

    const { result } = renderHook(() => useIntroDbSegments({ title: 'Dark' }, 1, 1), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('TVmaze request failed (HTTP 503)');
  });

  it('fails when IntroDB itself cannot be reached', async () => {
    tvmaze.searchTvmazeShows.mockResolvedValue([show('Dark', 'tt5753856', 2017)]);
    native.introDbFetchSegments.mockRejectedValue(new Error('IntroDB could not be reached'));

    const { result } = renderHook(() => useIntroDbSegments({ title: 'Dark' }, 1, 1), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('stays idle without a title, season or episode, or with IntroDB switched off', () => {
    const idle = [
      renderHook(() => useIntroDbSegments({ title: '' }, 1, 1), { wrapper: wrapper() }),
      renderHook(() => useIntroDbSegments({ title: 'Dark' }, null, 1), { wrapper: wrapper() }),
      renderHook(() => useIntroDbSegments({ title: 'Dark' }, 1, 1, false), { wrapper: wrapper() }),
    ];
    useSettingsStore.setState({ introDbEnabled: false });
    idle.push(
      renderHook(() => useIntroDbSegments({ title: 'Dark' }, 1, 1), { wrapper: wrapper() }),
    );

    for (const { result } of idle) expect(result.current.fetchStatus).toBe('idle');
    expect(tvmaze.searchTvmazeShows).not.toHaveBeenCalled();
  });
});
