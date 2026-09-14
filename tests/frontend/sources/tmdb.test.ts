import { describe, expect, it } from 'vitest';
import {
  normalizeTmdbCredits,
  normalizeTmdbMovie,
  normalizeTmdbPerson,
  normalizeTmdbSearch,
  normalizeTmdbTv,
  sanitizeTmdbImageUrl,
  sanitizeTmdbVideoUrl,
} from '@/modules/metadata/model/tmdb';

describe('TMDB normalization', () => {
  it('normalizes a movie and safely maps artwork and videos', () => {
    const movie = normalizeTmdbMovie({
      id: 603,
      title: '  The Matrix  ',
      original_title: 'The Matrix',
      overview: '  A computer hacker learns the truth. ',
      poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      backdrop_path: '/icmmSD4vTTDKOq2vvdulafOGw93.jpg',
      release_date: '1999-03-30',
      runtime: 136,
      vote_average: 8.2,
      vote_count: 25000,
      genres: [{ id: 28, name: 'Action' }, { id: 28, name: 'Action' }, { name: 'Sci-Fi' }],
      credits: {
        cast: [{ id: 1, name: 'Keanu Reeves', character: 'Neo', profile_path: '/actor.jpg' }],
        crew: [{ id: 2, name: 'Lana Wachowski', job: 'Director' }],
      },
      videos: {
        results: [{ id: 'trailer', key: 'dQw4w9WgXcQ', site: 'YouTube', type: 'Trailer' }],
      },
    });

    expect(movie).toMatchObject({
      mediaType: 'movie',
      id: 603,
      title: 'The Matrix',
      releaseYear: 1999,
      posterUrl: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/icmmSD4vTTDKOq2vvdulafOGw93.jpg',
      genres: [
        { id: 28, name: 'Action' },
        { id: null, name: 'Sci-Fi' },
      ],
      videos: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', site: 'YouTube' }],
    });
    expect(movie?.credits.cast[0]).toMatchObject({ name: 'Keanu Reeves', character: 'Neo' });
  });

  it('normalizes TV seasons and handles missing fields without throwing', () => {
    const tv = normalizeTmdbTv({
      id: 1399,
      name: 'Game of Thrones',
      first_air_date: '2011-04-17',
      episode_run_time: ['55', 61],
      seasons: [
        { id: 3627, season_number: 1, episode_count: 10, name: 'Season 1', air_date: '2011-04-17' },
        { id: 3627, season_number: 1, episode_count: 10, name: 'Duplicate' },
        { season_number: 'bad', name: 'Bad' },
      ],
      next_episode_to_air: {
        id: 501,
        name: 'The Next One',
        air_date: '2026-08-14',
        season_number: 9,
        episode_number: 3,
        still_path: '/episode.jpg',
      },
      last_episode_to_air: {
        id: 500,
        name: 'The Previous One',
        air_date: '2026-08-07',
        season_number: 9,
        episode_number: 2,
      },
    });

    expect(tv).toMatchObject({
      mediaType: 'tv',
      title: 'Game of Thrones',
      firstAirDate: '2011-04-17',
      releaseYear: 2011,
      runtimeMinutes: null,
      seasons: [{ seasonNumber: 1, episodeCount: 10 }],
      overview: '',
      genres: [],
      nextEpisodeToAir: {
        name: 'The Next One',
        airDate: '2026-08-14',
        seasonNumber: 9,
        episodeNumber: 3,
      },
      lastEpisodeToAir: {
        name: 'The Previous One',
        airDate: '2026-08-07',
        seasonNumber: 9,
        episodeNumber: 2,
      },
    });
    expect(normalizeTmdbTv(null)).toBeNull();
    expect(normalizeTmdbTv({ id: 'wrong', name: 'Nope' })).toBeNull();
  });

  it('deduplicates credits by person and merges roles/jobs', () => {
    const credits = normalizeTmdbCredits({
      cast: [
        { id: 7, name: 'Actor', character: 'Neo', order: 2 },
        {
          id: 7,
          name: 'Actor',
          character: 'Thomas Anderson',
          profile_path: '/actor.jpg',
          order: 1,
        },
        { name: 'No ID', character: 'One' },
        { name: 'No ID', character: 'One' },
      ],
      crew: [
        { id: 8, name: 'Maker', job: 'Writer' },
        { id: 8, name: 'Maker', job: 'Director' },
      ],
    });

    expect(credits.cast).toHaveLength(2);
    expect(credits.cast[0]).toMatchObject({
      id: 7,
      profileUrl: 'https://image.tmdb.org/t/p/w185/actor.jpg',
      roles: ['Neo', 'Thomas Anderson'],
    });
    expect(credits.cast[1]!.roles).toEqual(['One']);
    expect(credits.crew).toHaveLength(1);
    expect(credits.crew[0]!.jobs).toEqual(['Writer', 'Director']);
  });

  it('normalizes people and search results while dropping malformed entries', () => {
    const person = normalizeTmdbPerson({
      id: 287,
      name: 'Brad Pitt',
      biography: ' Actor ',
      profile_path: '/profile.jpg',
      birthday: '1963-12-18',
      combined_credits: { cast: [{ id: 1, name: 'Film', character: 'Self' }] },
    });
    const search = normalizeTmdbSearch({
      page: 1,
      total_pages: 2,
      results: [
        {
          id: 1,
          media_type: 'movie',
          title: 'Film',
          release_date: '2020-01-01',
          poster_path: '/p.jpg',
        },
        { id: 2, media_type: 'tv', name: 'Show', first_air_date: '2021-01-01' },
        { id: 3, media_type: 'person', name: 'Person', profile_path: '/person.jpg' },
        { id: 'bad', media_type: 'movie', title: 'Bad' },
        null,
      ],
    });

    expect(person).toMatchObject({ name: 'Brad Pitt', biography: 'Actor', birthday: '1963-12-18' });
    expect(person?.credits.cast).toHaveLength(1);
    expect(search.results.map((result) => result.mediaType)).toEqual(['movie', 'tv', 'person']);
    expect(search.results[0]!.posterUrl).toBe('https://image.tmdb.org/t/p/w500/p.jpg');
    expect(search.totalResults).toBe(3);
  });

  it('rejects unsafe or malformed image and video URLs', () => {
    expect(sanitizeTmdbImageUrl('/poster.jpg')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(sanitizeTmdbImageUrl('https://image.tmdb.org/t/p/original/poster.jpg?bad=1')).toBe(
      'https://image.tmdb.org/t/p/w500/poster.jpg',
    );
    expect(sanitizeTmdbImageUrl('https://evil.example/poster.jpg')).toBeNull();
    expect(sanitizeTmdbImageUrl('/../secret.jpg')).toBeNull();
    expect(sanitizeTmdbVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(sanitizeTmdbVideoUrl('javascript:alert(1)', 'YouTube')).toBeNull();
    expect(sanitizeTmdbVideoUrl('https://evil.example/watch?v=dQw4w9WgXcQ', 'YouTube')).toBeNull();
  });
});
