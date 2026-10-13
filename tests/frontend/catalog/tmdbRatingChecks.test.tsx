// @vitest-environment happy-dom

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTmdbRatingChecks } from '@/modules/catalog/data/useTmdbRatingChecks';
import { sortCatalogItems } from '@/modules/catalog/lib/smartCatalogFilter';
import { debugLog } from '@/modules/diagnostics/store/useDebugStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const tmdb = vi.hoisted(() => ({
  searchTmdbTitles: vi.fn(),
  getTmdbMovie: vi.fn(),
  getTmdbTv: vi.fn(),
}));
vi.mock('@/modules/metadata/data/tmdbClient', () => tmdb);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** Forty-five rated films, best provider score first. */
const films = Array.from({ length: 45 }, (_, index) => ({
  id: `film-${index}`,
  title: `Picture ${index} Story`,
  posterUrl: '',
  rating: Math.round((9.4 - index * 0.05) * 10) / 10,
}));

function searchAnswers(answer: (title: string) => { voteAverage: number; voteCount: number }) {
  tmdb.searchTmdbTitles.mockImplementation(
    async (_key: string, mediaType: string, title: string) => ({
      results: [
        {
          id: title.length,
          mediaType,
          title,
          originalTitle: null,
          releaseYear: null,
          genreIds: [],
          ...answer(title),
        },
      ],
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.getState().resetSettings();
  useSettingsStore.setState({ tmdbEnabled: true, tmdbApiKey: 'test-key', language: 'en' });
});

describe('useTmdbRatingChecks', () => {
  it('asks TMDB nothing while TMDB is off', () => {
    useSettingsStore.setState({ tmdbEnabled: false });
    const { result } = renderHook(() => useTmdbRatingChecks(films, 'movie'), {
      wrapper: wrapper(),
    });

    expect(result.current.size).toBe(0);
    expect(tmdb.searchTmdbTitles).not.toHaveBeenCalled();
  });

  it('checks the head of the ranking and pulls in titles that move up', async () => {
    // The ten best provider scores turn out to be old one-vote leftovers.
    const leftovers = new Set(films.slice(0, 10).map((film) => film.title));
    searchAnswers((title) =>
      leftovers.has(title)
        ? { voteAverage: 4.8, voteCount: 212 }
        : { voteAverage: 7.9, voteCount: 900 },
    );

    const { result } = renderHook(() => useTmdbRatingChecks(films, 'movie'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.size).toBe(45));
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(45);
    expect(result.current.get('film-0')).toEqual({
      status: 'matched',
      voteAverage: 4.8,
      voteCount: 212,
      genres: [],
    });
    const ranked = sortCatalogItems(films, 'rating', result.current).map((film) => film.id);
    expect(ranked.slice(0, 35)).not.toContain('film-0');
    expect(ranked.slice(-10)).toEqual(films.slice(0, 10).map((film) => film.id));
  });

  it('keeps provider ratings for titles TMDB could not be asked about, and asks again later', async () => {
    const warn = vi.spyOn(debugLog, 'warn');
    tmdb.searchTmdbTitles.mockRejectedValue(new Error('TMDB request failed (HTTP 401)'));
    const few = films.slice(0, 3);

    const { result, rerender } = renderHook(({ list }) => useTmdbRatingChecks(list, 'movie'), {
      wrapper: wrapper(),
      initialProps: { list: few },
    });

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        'api',
        'TMDB rating checks failed; provider ratings stand in',
        { mediaType: 'movie', failures: 3 },
      ),
    );
    // A failure is not a verdict: the titles keep their provider ratings.
    expect(result.current.size).toBe(0);
    expect(sortCatalogItems(few, 'rating', result.current).map((film) => film.id)).toEqual([
      'film-0',
      'film-1',
      'film-2',
    ]);

    // Another list reaching the same titles asks TMDB again.
    tmdb.searchTmdbTitles.mockClear();
    searchAnswers(() => ({ voteAverage: 6.1, voteCount: 50 }));
    rerender({ list: films.slice(0, 2) });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(2);
  });

  it('collects verdicts across lists instead of replacing them', async () => {
    searchAnswers((title) =>
      title === films[0]!.title
        ? { voteAverage: 4.8, voteCount: 212 }
        : { voteAverage: 7.9, voteCount: 900 },
    );
    const everything = films.slice(0, 6);
    const oneGenre = films.slice(3, 6);

    const { result, rerender } = renderHook(({ list }) => useTmdbRatingChecks(list, 'movie'), {
      wrapper: wrapper(),
      initialProps: { list: everything },
    });
    await waitFor(() => expect(result.current.size).toBe(6));
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(6);

    rerender({ list: oneGenre });

    // The genre's titles were checked already, and the corrected film-0,
    // which the genre does not contain, keeps its TMDB verdict.
    expect(result.current.size).toBe(6);
    expect(result.current.get('film-0')).toMatchObject({ status: 'matched', voteAverage: 4.8 });
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(6);
  });

  it('checks further down for a genre when the top of the list belongs to others', async () => {
    // Eighty films nothing names a genre for; TMDB knows the lower half as action.
    const catalogue = Array.from({ length: 80 }, (_, index) => ({
      id: `title-${index}`,
      title: `Picture ${index} Story`,
      posterUrl: '',
      categoryId: 'new',
      rating: Math.round((9.4 - index * 0.03) * 10) / 10,
    }));
    tmdb.searchTmdbTitles.mockImplementation(
      async (_key: string, mediaType: string, title: string) => ({
        results: [
          {
            id: title.length,
            mediaType,
            title,
            originalTitle: null,
            releaseYear: null,
            voteAverage: 7.5,
            voteCount: 400,
            genreIds: Number(title.split(' ')[1]) >= 50 ? [28] : [18],
          },
        ],
      }),
    );
    const categoryNameMap = new Map([['new', 'DE | Neu im Kino']]);

    const { result } = renderHook(
      () => useTmdbRatingChecks(catalogue, 'movie', { genre: 'Action', categoryNameMap }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.get('title-60')).toBeDefined());
    expect(result.current.get('title-60')).toMatchObject({ genres: ['Action'] });
    expect(result.current.get('title-0')).toMatchObject({ genres: ['Drama'] });
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(80);
  });

  it('ignores unrated titles, which no ranking can place', () => {
    const { result } = renderHook(
      () => useTmdbRatingChecks([{ id: 'x', title: 'No Rating', posterUrl: '' }], 'tv'),
      { wrapper: wrapper() },
    );

    expect(result.current.size).toBe(0);
    expect(tmdb.searchTmdbTitles).not.toHaveBeenCalled();
  });
});
