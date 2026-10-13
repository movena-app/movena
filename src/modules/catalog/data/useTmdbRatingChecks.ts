import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mapWithConcurrency } from '@/shared/lib/concurrency';
import { providerRatingValue, type TmdbRatingLookup } from '@/shared/lib/rating';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';
import { fetchTmdbTitleMatch } from '@/modules/metadata/public/data/tmdbTitleLookup';
import { useTmdbLookupSettings } from '@/modules/metadata/public/hooks/useTmdbLookupSettings';
import { getItemSetQueryScope, queryKeys } from '@/modules/sources/public/model/queryKeys';
import type { MediaItem } from '../model/media';
import { parseMediaDisplayTitle } from '../lib/titleParser';
import {
  itemHasKnownGenre,
  itemMatchesGenre,
  sortCatalogItems,
  type RatingLookups,
} from '../lib/smartCatalogFilter';

/** How much of a ranking is checked against TMDB: the part anyone looks at. */
const CHECKED_HEAD = 40;
/**
 * A checked title that turns out worse than its provider score drops away and
 * pulls an unchecked one into the head; each pass checks the newcomers until
 * the head is all checked. This caps the lookups one ranking may spend on it.
 */
const MAX_LOOKUPS = 200;
const MAX_CONCURRENT_LOOKUPS = 6;
const CHECKS_STALE_TIME = 1000 * 60 * 60 * 6;

const NO_LOOKUPS: RatingLookups = new Map();
const NO_VERDICTS: Record<string, TmdbRatingLookup> = Object.freeze({});

/**
 * TMDB ratings for the top of a rating-ranked list.
 *
 * Provider ratings are stale copies of TMDB at import time, so a ranking built
 * on them alone puts every title that once had a single 10.0 vote on top. The
 * whole catalogue cannot be checked, but its head can: the checks run until
 * the best CHECKED_HEAD titles all carry TMDB's current verdict.
 *
 * Verdicts are collected per media type, not per list. A genre or category is
 * a different list with its own head, and if its checks replaced the earlier
 * ones every title only the earlier list had checked would fall back to its
 * provider score — a corrected 9.4 would reappear in Top Rated the moment a
 * genre is picked. Collected, each list only checks what is still unknown and
 * every list ranks with everything TMDB has said so far.
 */
export interface TmdbRatingCheckOptions {
  enabled?: boolean | undefined;
  /**
   * Check the head of this genre instead of the whole list. `items` stays the
   * unfiltered list: which titles belong to the genre is part of what the
   * checks find out, since TMDB names a title's genres where the provider
   * often does not (Xtream film lists carry none).
   */
  genre?: string | null | undefined;
  categoryNameMap?: Map<string, string> | undefined;
}

export function useTmdbRatingChecks(
  items: readonly MediaItem[],
  mediaType: 'movie' | 'tv',
  { enabled = true, genre = null, categoryNameMap }: TmdbRatingCheckOptions = {},
): RatingLookups {
  const queryClient = useQueryClient();
  const tmdb = useTmdbLookupSettings();
  const pool = useMemo(
    () => items.filter((item) => providerRatingValue(item.rating) !== undefined),
    [items],
  );
  const poolScope = useMemo(() => getItemSetQueryScope(pool.map((item) => item.id)), [pool]);
  const active = enabled && tmdb.enabled && pool.length > 0;
  const genreFilter = genre && genre !== 'All' ? genre : null;
  const verdictsKey = queryKeys.tmdbRatingVerdicts(
    mediaType,
    tmdb.options.language,
    tmdb.options.includeAdult,
  );

  // Held in the query cache only so every list observes the same collection;
  // the checks below are what fill it.
  const verdicts = useQuery({
    queryKey: verdictsKey,
    queryFn: () =>
      queryClient.getQueryData<Record<string, TmdbRatingLookup>>(verdictsKey) ?? NO_VERDICTS,
    initialData: NO_VERDICTS,
    staleTime: Infinity,
    gcTime: CHECKS_STALE_TIME,
    enabled: tmdb.enabled,
  });

  useQuery({
    queryKey: queryKeys.tmdbRatingChecks(
      mediaType,
      poolScope,
      genreFilter,
      tmdb.options.language,
      tmdb.options.includeAdult,
    ),
    enabled: active,
    staleTime: CHECKS_STALE_TIME,
    gcTime: CHECKS_STALE_TIME,
    retry: false,
    queryFn: async (): Promise<number> => {
      const lookups = new Map<string, TmdbRatingLookup>(
        Object.entries(
          queryClient.getQueryData<Record<string, TmdbRatingLookup>>(verdictsKey) ?? NO_VERDICTS,
        ),
      );
      let spent = 0;
      let failures = 0;
      while (spent < MAX_LOOKUPS) {
        // In a genre, a title is a candidate when it belongs to the genre by
        // what is known, or when it is unchecked and nothing names its genre
        // yet; checking it either confirms it or moves it out.
        const candidates = genreFilter
          ? pool.filter(
              (item) =>
                itemMatchesGenre(item, genreFilter, categoryNameMap, lookups) ||
                (!lookups.has(item.id) && !itemHasKnownGenre(item, categoryNameMap, lookups)),
            )
          : pool;
        const head = sortCatalogItems([...candidates], 'rating', lookups).slice(0, CHECKED_HEAD);
        const unchecked = head
          .filter((item) => !lookups.has(item.id))
          .slice(0, MAX_LOOKUPS - spent);
        if (unchecked.length === 0) break;
        spent += unchecked.length;
        const results = await mapWithConcurrency(
          unchecked,
          MAX_CONCURRENT_LOOKUPS,
          async (item): Promise<TmdbRatingLookup> => {
            const parsed = parseMediaDisplayTitle(item.title, item.year);
            try {
              const match = await fetchTmdbTitleMatch(
                queryClient,
                tmdb.apiKey,
                {
                  mediaType,
                  title: parsed.cleanTitle,
                  year: parsed.releaseYear ? Number(parsed.releaseYear) : null,
                },
                tmdb.options,
              );
              return match
                ? {
                    status: 'matched',
                    voteAverage: match.voteAverage,
                    voteCount: match.voteCount,
                    genres: match.genres,
                  }
                : { status: 'unmatched' };
            } catch {
              // The title keeps its provider rating; the failure count is logged below.
              failures += 1;
              return { status: 'failed' };
            }
          },
        );
        const found: Record<string, TmdbRatingLookup> = {};
        unchecked.forEach((item, index) => {
          const result = results[index]!;
          lookups.set(item.id, result);
          // A failure is not a verdict: the next list to reach the title asks again.
          if (result.status !== 'failed') found[item.id] = result;
        });
        // Published after every pass: the first one holds most of the
        // corrections, and a large catalogue's later passes take a while.
        if (Object.keys(found).length > 0) {
          queryClient.setQueryData<Record<string, TmdbRatingLookup>>(verdictsKey, (known) => ({
            ...known,
            ...found,
          }));
        }
      }
      if (failures > 0) {
        debugLog.warn('api', 'TMDB rating checks failed; provider ratings stand in', {
          mediaType,
          failures,
        });
      }
      return spent;
    },
  });

  const known = verdicts.data;
  return useMemo(
    () => (enabled && tmdb.enabled ? new Map(Object.entries(known)) : NO_LOOKUPS),
    [enabled, known, tmdb.enabled],
  );
}
