import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTmdbMovie, getTmdbTv, searchTmdb } from '@/modules/metadata/data/tmdbClient';

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
});
