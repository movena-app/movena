import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTmdbTitleMatch } from '@/modules/metadata/data/tmdbTitleLookup';

const tmdb = vi.hoisted(() => ({
  searchTmdbTitles: vi.fn(),
  getTmdbMovie: vi.fn(),
  getTmdbTv: vi.fn(),
}));
vi.mock('@/modules/metadata/data/tmdbClient', () => tmdb);

const options = { language: 'en-US', includeAdult: false, imageSize: 'w500' } as const;

function result(
  id: number,
  title: string,
  releaseYear: number | null,
  voteAverage = 7,
  voteCount = 100,
) {
  return {
    id,
    mediaType: 'movie',
    title,
    originalTitle: null,
    releaseYear,
    voteAverage,
    voteCount,
    genreIds: [] as number[],
  };
}

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('fetchTmdbTitleMatch', () => {
  it('uses a provider TMDB id once its title checks out, without searching', async () => {
    tmdb.getTmdbMovie.mockResolvedValue({
      ...result(550, 'Fight Club', 1999, 8.4, 30_000),
      genres: [
        { id: 18, name: 'Drama' },
        { id: null, name: 'Unknown' },
      ],
    });

    const match = await fetchTmdbTitleMatch(
      client,
      'key',
      { mediaType: 'movie', title: 'Fight Club', year: 1999, tmdbId: 550 },
      options,
    );

    expect(match).toEqual({ id: 550, voteAverage: 8.4, voteCount: 30_000, genres: ['Drama'] });
    expect(tmdb.getTmdbMovie).toHaveBeenCalledWith('key', 550, undefined, options);
    expect(tmdb.searchTmdbTitles).not.toHaveBeenCalled();
  });

  it('searches when the provider id points at another title or nowhere', async () => {
    tmdb.getTmdbTv.mockResolvedValueOnce({ ...result(1, 'Unrelated Show', 2010), mediaType: 'tv' });
    tmdb.searchTmdbTitles.mockResolvedValue({
      results: [{ ...result(77, 'Example Show', 2015), mediaType: 'tv' }],
    });

    await expect(
      fetchTmdbTitleMatch(
        client,
        'key',
        { mediaType: 'tv', title: 'Example Show', year: 2015, tmdbId: 1 },
        options,
      ),
    ).resolves.toMatchObject({ id: 77 });

    tmdb.getTmdbTv.mockRejectedValueOnce(new Error('TMDB request failed (HTTP 404)'));
    await expect(
      fetchTmdbTitleMatch(
        client,
        'key',
        { mediaType: 'tv', title: 'Example Show', year: 2015, tmdbId: 2 },
        options,
      ),
    ).resolves.toMatchObject({ id: 77 });
  });

  it('retries without the year when the provider dates the title differently', async () => {
    tmdb.searchTmdbTitles.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({
      results: [{ ...result(3, 'City of Blood', 2023, 4.8, 212), genreIds: [27, 53, 37] }],
    });

    const match = await fetchTmdbTitleMatch(
      client,
      'key',
      { mediaType: 'movie', title: 'City of Bloods', year: 2024 },
      options,
    );

    expect(match).toEqual({
      id: 3,
      voteAverage: 4.8,
      voteCount: 212,
      genres: ['Horror', 'Thriller'],
    });
    expect(tmdb.searchTmdbTitles.mock.calls.map((call) => call[3])).toEqual([2024, null]);
  });

  it('reports no match instead of taking an unrelated first result', async () => {
    tmdb.searchTmdbTitles.mockResolvedValue({
      results: [result(9, 'Something Else Entirely', 2020, 10, 1)],
    });

    await expect(
      fetchTmdbTitleMatch(client, 'key', { mediaType: 'movie', title: 'City of Bloods' }, options),
    ).resolves.toBeNull();
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(1);
  });

  it('caches each title so lists and details share one lookup', async () => {
    tmdb.searchTmdbTitles.mockResolvedValue({ results: [result(4, 'The Dink', 2026)] });
    const lookup = { mediaType: 'movie' as const, title: 'The Dink', year: 2026 };

    await fetchTmdbTitleMatch(client, 'key', lookup, options);
    await fetchTmdbTitleMatch(client, 'key', { ...lookup, title: 'the dink' }, options);

    expect(tmdb.searchTmdbTitles).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed search to the caller', async () => {
    tmdb.searchTmdbTitles.mockRejectedValue(new Error('TMDB request failed (HTTP 401)'));

    await expect(
      fetchTmdbTitleMatch(client, 'key', { mediaType: 'movie', title: 'Anything' }, options),
    ).rejects.toThrow('HTTP 401');
  });
});
