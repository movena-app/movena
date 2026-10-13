import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';
import { TMDB_RATING_OFF, type TmdbRatingLookup } from '@/shared/lib/rating';
import { queryKeys } from '@/modules/sources/public/model/queryKeys';
import { fetchTmdbDetails, fetchTmdbTitleMatch } from '../data/tmdbTitleLookup';
import type { NormalizedTmdbMovie, NormalizedTmdbTv } from '../model/tmdb';
import { tmdbTitleKey } from '../model/tmdbMatch';
import { useTmdbLookupSettings } from './useTmdbLookupSettings';

export interface TmdbDetailLookup {
  /** Display title with provider prefixes, tags and the year already removed. */
  title: string;
  year?: number | null | undefined;
  /** A TMDB id the provider attached to the title. It is checked before it is used. */
  tmdbId?: number | null | undefined;
  /**
   * False while the provider's own details are still loading, so the lookup
   * waits for the id and year they carry instead of searching twice.
   */
  ready?: boolean | undefined;
}

export interface TmdbDetailEnrichment<T> {
  /** TMDB's details once TMDB has found this exact title. */
  details: T | null;
  /** How the lookup stands, which decides whether a provider rating may stand in. */
  rating: TmdbRatingLookup;
}

const DETAILS_STALE_TIME = 1000 * 60 * 60 * 12;

export function useTmdbDetailEnrichment(
  mediaType: 'movie',
  lookup: TmdbDetailLookup,
): TmdbDetailEnrichment<NormalizedTmdbMovie>;
export function useTmdbDetailEnrichment(
  mediaType: 'tv',
  lookup: TmdbDetailLookup,
): TmdbDetailEnrichment<NormalizedTmdbTv>;
export function useTmdbDetailEnrichment(
  mediaType: 'movie' | 'tv',
  lookup: TmdbDetailLookup,
): TmdbDetailEnrichment<NormalizedTmdbMovie | NormalizedTmdbTv> {
  const queryClient = useQueryClient();
  const tmdb = useTmdbLookupSettings();
  const title = lookup.title.trim();
  const year = lookup.year ?? null;
  const tmdbId = lookup.tmdbId ?? null;
  const active = tmdb.enabled && title.length > 0;

  const query = useQuery({
    queryKey: queryKeys.tmdbTitleDetails(
      mediaType,
      tmdbTitleKey(title),
      year,
      tmdbId,
      tmdb.options.language,
      tmdb.options.includeAdult,
      tmdb.options.imageSize,
    ),
    enabled: active && lookup.ready !== false,
    staleTime: DETAILS_STALE_TIME,
    retry: false,
    queryFn: async () => {
      const match = await fetchTmdbTitleMatch(
        queryClient,
        tmdb.apiKey,
        { mediaType, title, year, tmdbId },
        tmdb.options,
      );
      return match
        ? fetchTmdbDetails(queryClient, tmdb.apiKey, mediaType, match.id, tmdb.options)
        : null;
    },
  });

  useEffect(() => {
    if (!query.error) return;
    notify.warning(
      'TMDB Enrichment Failed',
      getErrorMessage(query.error, 'TMDB enrichment failed without an error message.'),
      undefined,
      undefined,
      'connection',
    );
  }, [query.error]);

  if (!active) return { details: null, rating: TMDB_RATING_OFF };
  if (query.isError) return { details: null, rating: { status: 'failed' } };
  if (query.data === undefined) return { details: null, rating: { status: 'pending' } };
  if (query.data === null) return { details: null, rating: { status: 'unmatched' } };
  return {
    details: query.data,
    rating: {
      status: 'matched',
      voteAverage: query.data.voteAverage,
      voteCount: query.data.voteCount,
    },
  };
}
