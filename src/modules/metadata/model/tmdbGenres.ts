/**
 * TMDB's genre ids in Movena's catalogue genre vocabulary. The ids are fixed
 * across languages; TMDB genres Movena has no filter for (War, Western,
 * Reality, …) are left out. Series combine some genres into one id.
 */
const MOVIE_GENRES: Readonly<Record<number, readonly string[]>> = {
  28: ['Action'],
  12: ['Adventure'],
  16: ['Animation'],
  35: ['Comedy'],
  80: ['Crime'],
  99: ['Documentary'],
  18: ['Drama'],
  10751: ['Family'],
  14: ['Fantasy'],
  27: ['Horror'],
  9648: ['Mystery'],
  10749: ['Romance'],
  878: ['Sci-Fi'],
  53: ['Thriller'],
};

const TV_GENRES: Readonly<Record<number, readonly string[]>> = {
  10759: ['Action', 'Adventure'],
  16: ['Animation'],
  35: ['Comedy'],
  80: ['Crime'],
  99: ['Documentary'],
  18: ['Drama'],
  10751: ['Family'],
  10762: ['Family'],
  9648: ['Mystery'],
  10765: ['Sci-Fi', 'Fantasy'],
};

export function tmdbGenreNames(mediaType: 'movie' | 'tv', genreIds: readonly number[]): string[] {
  const table = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return [...new Set(genreIds.flatMap((genreId) => table[genreId] ?? []))];
}
