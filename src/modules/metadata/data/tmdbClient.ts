import {
  normalizeTmdbMovie,
  normalizeTmdbSearch,
  normalizeTmdbTv,
  normalizeTmdbExternalIds,
  sanitizeTmdbImageUrl,
  type NormalizedTmdbExternalIds,
  type NormalizedTmdbMovie,
  type NormalizedTmdbSearchResponse,
  type NormalizedTmdbTv,
  type TmdbImageSize,
} from '../model/tmdb';
import type { UiLocale } from '@/shared/i18n/config';

const TMDB_API = 'https://api.themoviedb.org/3';

export interface TmdbRequestOptions {
  language?: UiLocale | undefined;
  includeAdult?: boolean | undefined;
  imageSize?: TmdbImageSize | undefined;
}

async function tmdbRequest(
  path: string,
  apiKey: string,
  signal?: AbortSignal,
  options: TmdbRequestOptions = {},
): Promise<unknown> {
  const key = apiKey.trim();
  if (!key) return null;
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set('api_key', key);
  if (options.language) url.searchParams.set('language', options.language);
  if (options.includeAdult !== undefined)
    url.searchParams.set('include_adult', String(options.includeAdult));
  const response = await fetch(url, {
    ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      `TMDB request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''})`,
    );
  return response.json();
}

export async function searchTmdb(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
  options: TmdbRequestOptions = {},
): Promise<NormalizedTmdbSearchResponse> {
  const encoded = encodeURIComponent(query.trim());
  if (!encoded) return normalizeTmdbSearch(null);
  return normalizeTmdbSearch(
    await tmdbRequest(`/search/multi?query=${encoded}`, apiKey, signal, options),
  );
}

export async function getTmdbMovie(
  apiKey: string,
  id: number,
  signal?: AbortSignal,
  options: TmdbRequestOptions = {},
): Promise<NormalizedTmdbMovie | null> {
  const movie = normalizeTmdbMovie(
    await tmdbRequest(`/movie/${id}?append_to_response=credits,videos`, apiKey, signal, options),
  );
  if (!movie || !options.imageSize) return movie;
  return {
    ...movie,
    posterUrl: movie.posterUrl ? sanitizeTmdbImageUrl(movie.posterUrl, options.imageSize) : null,
  };
}

export async function getTmdbTv(
  apiKey: string,
  id: number,
  signal?: AbortSignal,
  options: TmdbRequestOptions = {},
): Promise<NormalizedTmdbTv | null> {
  const tv = normalizeTmdbTv(
    await tmdbRequest(`/tv/${id}?append_to_response=credits,videos`, apiKey, signal, options),
  );
  if (!tv || !options.imageSize) return tv;
  return {
    ...tv,
    posterUrl: tv.posterUrl ? sanitizeTmdbImageUrl(tv.posterUrl, options.imageSize) : null,
  };
}

/** Fetch external identifiers (IMDB, TVDB, etc.) for a TV series. */
export async function getTmdbTvExternalIds(
  apiKey: string,
  tvId: number,
  signal?: AbortSignal,
): Promise<NormalizedTmdbExternalIds> {
  return normalizeTmdbExternalIds(await tmdbRequest(`/tv/${tvId}/external_ids`, apiKey, signal));
}
