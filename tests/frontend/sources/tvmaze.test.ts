import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTvmazeSearchTitle,
  getTvmazeEpisodes,
  getTvmazeUpcomingEpisodes,
  searchTvmazeShows,
} from '@/modules/metadata/data/tvMazeClient';
import {
  findFutureTvmazeEpisodes,
  findNextTvmazeEpisode,
  normalizeTvmazeAirstamp,
  normalizeTvmazeShowSearch,
} from '@/modules/metadata/model/tvMaze';

afterEach(() => vi.unstubAllGlobals());

describe('TVmaze normalization', () => {
  it('normalizes unique show search results and validated external ids', () => {
    const shows = normalizeTvmazeShowSearch([
      {
        score: 1,
        show: {
          id: 1,
          name: '  Example Show  ',
          externals: { imdb: 'tt1234567', thetvdb: 9, tvrage: 22 },
        },
      },
      { score: 0.5, show: { id: 1, name: 'Duplicate' } },
      { score: 0, show: { id: 'bad', name: 'Invalid' } },
      { score: 0, show: { id: 2, name: 'Second', externals: { imdb: 'not-an-id', thetvdb: '3' } } },
    ]);

    expect(shows).toEqual([
      { id: 1, name: 'Example Show', externals: { imdb: 'tt1234567', thetvdb: 9, tvrage: 22 } },
      { id: 2, name: 'Second', externals: { imdb: null, thetvdb: null, tvrage: null } },
    ]);
  });

  it('requires a valid timezone-aware ISO airstamp and chooses the earliest future episode', () => {
    expect(normalizeTvmazeAirstamp('2026-02-30T20:00:00Z')).toBeNull();
    expect(normalizeTvmazeAirstamp('2026-08-13T20:00:00')).toBeNull();
    expect(normalizeTvmazeAirstamp('2026-08-13T20:00:00-04:00')).toBe('2026-08-13T20:00:00-04:00');

    const next = findNextTvmazeEpisode(
      [
        { id: 4, name: 'No exact time', airstamp: null },
        { id: 3, name: 'Later', season: 2, number: 2, airstamp: '2026-08-14T20:00:00Z' },
        { id: 2, name: 'Sooner', season: 2, number: 1, airstamp: '2026-08-13T20:00:00-04:00' },
        { id: 1, name: 'Already aired', airstamp: '2026-08-12T20:00:00Z' },
      ],
      new Date('2026-08-13T12:00:00Z'),
    );

    expect(next).toMatchObject({ id: 2, name: 'Sooner', seasonNumber: 2, episodeNumber: 1 });
    expect(
      findFutureTvmazeEpisodes(
        [
          { id: 3, name: 'Later', season: 2, number: 2, airstamp: '2026-08-14T20:00:00Z' },
          { id: 2, name: 'Sooner', season: 2, number: 1, airstamp: '2026-08-13T20:00:00-04:00' },
          { id: 1, name: 'Already aired', airstamp: '2026-08-12T20:00:00Z' },
        ],
        new Date('2026-08-13T12:00:00Z'),
      ).map((episode) => episode.id),
    ).toEqual([2, 3]);
  });
});

describe('TVmaze API boundary', () => {
  it('cleans a provider title, safely searches without a key, and forwards the abort signal', async () => {
    expect(cleanTvmazeSearchTitle('4K-DE - Example Show (2026)')).toBe('Example Show');
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { show: { id: 7, name: 'Example Show', externals: { imdb: 'tt9876543' } } },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      searchTvmazeShows('4K-DE - Example Show (2026)', controller.signal),
    ).resolves.toMatchObject([{ id: 7, name: 'Example Show' }]);
    const request = fetchMock.mock.calls[0]!;
    const url = new URL(request[0]!.toString());
    expect(url.origin).toBe('https://api.tvmaze.com');
    expect(url.pathname).toBe('/search/shows');
    expect(url.searchParams.get('q')).toBe('Example Show');
    expect(request[1]!.signal).toBe(controller.signal);
  });

  it('uses one ordinary-episodes request and returns every exact future timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 4, name: 'Past', season: 3, number: 3, airstamp: '2026-08-12T20:00:00Z' },
          { id: 5, name: 'Future', season: 3, number: 4, airstamp: '2026-08-13T20:00:00Z' },
          { id: 6, name: 'Later', season: 3, number: 5, airstamp: '2026-08-20T20:00:00Z' },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getTvmazeUpcomingEpisodes(9, undefined, new Date('2026-08-13T12:00:00Z')),
    ).resolves.toMatchObject([
      { id: 5, name: 'Future', airstamp: '2026-08-13T20:00:00Z' },
      { id: 6, name: 'Later', airstamp: '2026-08-20T20:00:00Z' },
    ]);
    const url = new URL(fetchMock.mock.calls[0]![0].toString());
    expect(url.pathname).toBe('/shows/9/episodes');
    expect(url.searchParams.get('specials')).toBe('0');
  });

  it('keeps normalized past episodes in the reusable schedule response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 4, name: 'Past', season: 3, number: 3, airstamp: '2026-08-12T20:00:00Z' },
          { id: 5, name: 'Future', season: 3, number: 4, airstamp: '2026-08-13T20:00:00Z' },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTvmazeEpisodes(9)).resolves.toMatchObject([
      { id: 4, name: 'Past' },
      { id: 5, name: 'Future' },
    ]);
  });

  it('avoids network calls for blank titles or invalid ids and redacts request failures', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchTvmazeShows('   ')).resolves.toEqual([]);
    await expect(getTvmazeUpcomingEpisodes(0)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(searchTvmazeShows('Example')).rejects.toThrow('TVmaze request failed (HTTP 429)');
  });
});
