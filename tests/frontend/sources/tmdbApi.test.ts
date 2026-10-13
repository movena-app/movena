import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTmdbMovie,
  getTmdbTv,
  searchTmdb,
  searchTmdbTitles,
} from '@/modules/metadata/data/tmdbClient';
import { normalizeTmdbId } from '@/modules/metadata/model/tmdb';

afterEach(() => vi.unstubAllGlobals());

describe('TMDB API boundary', () => {
  it('omits empty-key requests and normalizes a search response', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchTmdb('   ', 'The Matrix')).resolves.toEqual({
      page: 1,
      totalPages: 0,
      totalResults: 0,
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          page: 1,
          total_pages: 2,
          total_results: 1,
          results: [{ id: 603, media_type: 'movie', title: 'The Matrix' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await searchTmdb('api-key', '  The Matrix & Friends  ', undefined, {
      language: 'de-DE',
      includeAdult: false,
    });
    expect(result.results[0]).toMatchObject({ id: 603, title: 'The Matrix' });

    const requestUrl = new URL(fetchMock.mock.calls[0]![0].toString());
    expect(requestUrl.pathname).toBe('/3/search/multi');
    expect(requestUrl.searchParams.get('api_key')).toBe('api-key');
    expect(requestUrl.searchParams.get('query')).toBe('The Matrix & Friends');
    expect(requestUrl.searchParams.get('language')).toBe('de-DE');
    expect(requestUrl.searchParams.get('include_adult')).toBe('false');
  });

  it('fetches details with append-to-response and applies the configured image size', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 10,
            title: 'Movie',
            poster_path: '/movie.jpg',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 20,
            name: 'Show',
            poster_path: '/show.jpg',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTmdbMovie('key', 10, undefined, { imageSize: 'w780' })).resolves.toMatchObject({
      posterUrl: 'https://image.tmdb.org/t/p/w780/movie.jpg',
    });
    await expect(getTmdbTv('key', 20)).resolves.toMatchObject({
      posterUrl: 'https://image.tmdb.org/t/p/w500/show.jpg',
    });

    const movieUrl = new URL(fetchMock.mock.calls[0]![0].toString());
    expect(movieUrl.pathname).toBe('/3/movie/10');
    expect(movieUrl.searchParams.get('append_to_response')).toBe('credits,videos');
    expect(movieUrl.searchParams.get('api_key')).toBe('key');
  });

  it('surfaces HTTP failures without exposing the API key in the error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    await expect(searchTmdb('super-secret-key', 'Movie')).rejects.toThrow(
      'TMDB request failed (HTTP 401)',
    );
    await expect(searchTmdb('super-secret-key', 'Movie')).rejects.not.toThrow('super-secret-key');
  });

  it('searches one media type within a release year and keeps vote counts', async () => {
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          results: [
            {
              id: 1,
              title: 'City of Blood',
              release_date: '2023-04-01',
              vote_average: 4.8,
              vote_count: 212,
              genre_ids: [18, 53, 18, 'x', -1],
            },
            { id: 2, name: 'A Person', profile_path: '/p.jpg', media_type: 'person' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({ results: [{ id: 9, name: 'Blood Show', first_air_date: '2020-01-01' }] }),
      )
      .mockResolvedValueOnce(json({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const movies = await searchTmdbTitles('key', 'movie', ' City of Blood ', 2023);
    expect(movies.results).toEqual([
      expect.objectContaining({
        id: 1,
        mediaType: 'movie',
        voteAverage: 4.8,
        voteCount: 212,
        genreIds: [18, 53],
        releaseYear: 2023,
      }),
    ]);
    const series = await searchTmdbTitles('key', 'tv', 'Blood Show', 2020, undefined, {
      language: 'de-DE',
    });
    expect(series.results).toEqual([
      expect.objectContaining({ id: 9, mediaType: 'tv', voteCount: 0 }),
    ]);
    await searchTmdbTitles('key', 'movie', 'Anything', null);
    await expect(searchTmdbTitles('key', 'movie', '   ', 2023)).resolves.toMatchObject({
      results: [],
    });

    const [movieUrl, tvUrl, anyYearUrl] = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(movieUrl!.pathname).toBe('/3/search/movie');
    expect(movieUrl!.searchParams.get('query')).toBe('City of Blood');
    expect(movieUrl!.searchParams.get('year')).toBe('2023');
    expect(tvUrl!.pathname).toBe('/3/search/tv');
    expect(tvUrl!.searchParams.get('first_air_date_year')).toBe('2020');
    expect(tvUrl!.searchParams.get('language')).toBe('de-DE');
    expect(anyYearUrl!.searchParams.has('year')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reads provider TMDB ids from numbers and numeric strings only', () => {
    expect(normalizeTmdbId(550)).toBe(550);
    expect(normalizeTmdbId(' 1399 ')).toBe(1399);
    for (const value of ['0', 0, '', 'tt0944947', '12a', -4, 1.5, null, undefined, '1234567890']) {
      expect(normalizeTmdbId(value), String(value)).toBeNull();
    }
  });
});
