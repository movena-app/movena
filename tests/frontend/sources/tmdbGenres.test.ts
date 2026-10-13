import { describe, expect, it } from 'vitest';
import { tmdbGenreNames } from '@/modules/metadata/model/tmdbGenres';

describe('tmdbGenreNames', () => {
  it("maps TMDB's movie genre ids onto the catalogue's genres", () => {
    expect(tmdbGenreNames('movie', [28, 878, 53])).toEqual(['Action', 'Sci-Fi', 'Thriller']);
    expect(tmdbGenreNames('movie', [10751, 16])).toEqual(['Family', 'Animation']);
  });

  it('splits combined series genres and merges duplicates', () => {
    expect(tmdbGenreNames('tv', [10759, 10765])).toEqual([
      'Action',
      'Adventure',
      'Sci-Fi',
      'Fantasy',
    ]);
    expect(tmdbGenreNames('tv', [10751, 10762])).toEqual(['Family']);
  });

  it('drops genres the catalogue has no filter for and ids of the other media type', () => {
    expect(tmdbGenreNames('movie', [37, 10752, 10770])).toEqual([]);
    expect(tmdbGenreNames('movie', [10759])).toEqual([]);
    expect(tmdbGenreNames('tv', [28])).toEqual([]);
    expect(tmdbGenreNames('tv', [])).toEqual([]);
  });
});
