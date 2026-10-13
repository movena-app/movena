import type { QueryClient } from '@tanstack/react-query';
import type { UiLocale } from '@/shared/i18n/config';
import { queryKeys } from '@/modules/sources/public/model/queryKeys';
import { getTmdbMovie, getTmdbTv, searchTmdbTitles } from './tmdbClient';
import type { NormalizedTmdbMovie, NormalizedTmdbTv, TmdbImageSize } from '../model/tmdb';
import { tmdbGenreNames } from '../model/tmdbGenres';
import { selectTmdbMatch, tmdbTitleKey } from '../model/tmdbMatch';

export interface TmdbLookupOptions {
  language: UiLocale;
  includeAdult: boolean;
  imageSize: TmdbImageSize;
}

export interface TmdbTitleLookup {
  mediaType: 'movie' | 'tv';
  /** Display title with provider prefixes, tags and the year already removed. */
  title: string;
  year?: number | null | undefined;
  /** A TMDB id the provider attached to the title. */
  tmdbId?: number | null | undefined;
}

export interface TmdbTitleMatch {
  id: number;
  voteAverage: number | null;
  voteCount: number;
  /** In Movena's genre vocabulary; see tmdbGenreNames. */
  genres: string[];
}

const MATCH_STALE_TIME = 1000 * 60 * 60 * 24;
const DETAILS_STALE_TIME = 1000 * 60 * 60 * 12;

export function fetchTmdbDetails(
  queryClient: QueryClient,
  apiKey: string,
  mediaType: 'movie',
  id: number,
  options: TmdbLookupOptions,
): Promise<NormalizedTmdbMovie | null>;
export function fetchTmdbDetails(
  queryClient: QueryClient,
  apiKey: string,
  mediaType: 'tv',
  id: number,
  options: TmdbLookupOptions,
): Promise<NormalizedTmdbTv | null>;
export function fetchTmdbDetails(
  queryClient: QueryClient,
  apiKey: string,
  mediaType: 'movie' | 'tv',
  id: number,
  options: TmdbLookupOptions,
): Promise<NormalizedTmdbMovie | NormalizedTmdbTv | null>;
export function fetchTmdbDetails(
  queryClient: QueryClient,
  apiKey: string,
  mediaType: 'movie' | 'tv',
  id: number,
  options: TmdbLookupOptions,
): Promise<NormalizedTmdbMovie | NormalizedTmdbTv | null> {
  const { language, includeAdult, imageSize } = options;
  return mediaType === 'movie'
    ? queryClient.fetchQuery({
        queryKey: queryKeys.tmdbMovie(id, language, includeAdult, imageSize),
        staleTime: DETAILS_STALE_TIME,
        retry: false,
        queryFn: () => getTmdbMovie(apiKey, id, undefined, options),
      })
    : queryClient.fetchQuery({
        queryKey: queryKeys.tmdbTv(id, language, includeAdult, imageSize),
        staleTime: DETAILS_STALE_TIME,
        retry: false,
        queryFn: () => getTmdbTv(apiKey, id, undefined, options),
      });
}

function toMatch(
  mediaType: 'movie' | 'tv',
  source: { id: number; voteAverage: number | null; voteCount: number },
  genreIds: readonly number[],
): TmdbTitleMatch {
  return {
    id: source.id,
    voteAverage: source.voteAverage,
    voteCount: source.voteCount,
    genres: tmdbGenreNames(mediaType, genreIds),
  };
}

async function findTmdbTitle(
  queryClient: QueryClient,
  apiKey: string,
  lookup: TmdbTitleLookup,
  options: TmdbLookupOptions,
): Promise<TmdbTitleMatch | null> {
  const query = { title: lookup.title, year: lookup.year };
  if (lookup.tmdbId) {
    // A provider's id is a hint, not an answer: panels store whatever their
    // own import matched, sometimes a movie id on a series. It has to pass the
    // same title check as a search result, and when it leads nowhere — an id
    // TMDB no longer knows answers with an error — the search below decides.
    const details = await fetchTmdbDetails(
      queryClient,
      apiKey,
      lookup.mediaType,
      lookup.tmdbId,
      options,
    ).catch(() => null);
    if (details && selectTmdbMatch(query, [details])) {
      const genreIds = details.genres.flatMap((genre) => (genre.id === null ? [] : [genre.id]));
      return toMatch(lookup.mediaType, details, genreIds);
    }
  }

  const inYear = await searchTmdbTitles(
    apiKey,
    lookup.mediaType,
    lookup.title,
    lookup.year,
    undefined,
    options,
  );
  let match = selectTmdbMatch(query, inYear.results);
  if (!match && lookup.year) {
    // The provider's year can be a territory's release a year after the
    // premiere TMDB files it under; the match still allows that distance.
    const anyYear = await searchTmdbTitles(
      apiKey,
      lookup.mediaType,
      lookup.title,
      null,
      undefined,
      options,
    );
    match = selectTmdbMatch(query, anyYear.results);
  }
  return match ? toMatch(lookup.mediaType, match, match.genreIds) : null;
}

/** The TMDB entry that is this title, or null when TMDB has none. Cached per title. */
export function fetchTmdbTitleMatch(
  queryClient: QueryClient,
  apiKey: string,
  lookup: TmdbTitleLookup,
  options: TmdbLookupOptions,
): Promise<TmdbTitleMatch | null> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.tmdbTitleMatch(
      lookup.mediaType,
      tmdbTitleKey(lookup.title),
      lookup.year ?? null,
      lookup.tmdbId ?? null,
      options.language,
      options.includeAdult,
    ),
    staleTime: MATCH_STALE_TIME,
    gcTime: MATCH_STALE_TIME,
    retry: false,
    queryFn: () => findTmdbTitle(queryClient, apiKey, lookup, options),
  });
}
