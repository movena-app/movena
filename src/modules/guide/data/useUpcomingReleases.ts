import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaItem } from '@/modules/catalog/public/model/media';
import { uiLanguageDefinition } from '@/shared/i18n/config';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { parseMediaDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import { getTvmazeEpisodes, searchTvmazeShows } from '@/modules/metadata/public/data/tvMazeClient';
import {
  getTmdbMovie,
  getTmdbTv,
  searchTmdb,
  type TmdbRequestOptions,
} from '@/modules/metadata/public/data/tmdbClient';
import { queryKeys } from '@/modules/sources/public/model/queryKeys';
import { getErrorMessage } from '@/shared/lib/error';
import { notify } from '@/shared/notifications/useNotificationStore';

export interface UpcomingRelease {
  favorite: MediaItem;
  tmdbId: number;
  airDate: string;
  kind: 'movie' | 'episode';
  title: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  artworkUrl: string | null;
  /** A timezone-aware TVmaze broadcast/streaming instant when it is known. */
  exactAirTime: string | null;
  timeSource: 'tvmaze' | 'tmdb';
}

export interface UpcomingReleaseOptions {
  /** Restrict the batch to specific favorite ids while preserving the same
   * canonical search/detail caches used by the full Coming Up workspace. */
  favoriteIds?: readonly string[] | undefined;
}

const SEARCH_STALE_TIME = 1000 * 60 * 60 * 24 * 30;
const DETAILS_STALE_TIME = 1000 * 60 * 60 * 12;
const TVMAZE_STALE_TIME = 1000 * 60 * 60 * 12;
const MAX_CONCURRENT_LOOKUPS = 3;

function titleForTmdb(item: MediaItem): string {
  return parseMediaDisplayTitle(item.title, item.year)?.cleanTitle ?? item.title.trim();
}

function titleMatchKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

interface TmdbMatchCandidate {
  mediaType: 'movie' | 'tv' | 'person';
  id: number;
  title: string;
  originalTitle?: string | null | undefined;
  releaseYear?: string | number | null | undefined;
}

/** Prefer the actual title/year match instead of trusting TMDB result order. */
export function selectUpcomingTmdbMatch(
  favorite: Pick<MediaItem, 'title' | 'year'>,
  mediaType: 'movie' | 'tv',
  candidates: readonly TmdbMatchCandidate[],
): TmdbMatchCandidate | undefined {
  const wantedTitle = titleMatchKey(
    parseMediaDisplayTitle(favorite.title, favorite.year)?.cleanTitle ?? favorite.title.trim(),
  );
  const wantedYear = favorite.year?.match(/(?:19|20)\d{2}/)?.[0];
  return candidates
    .filter((candidate) => candidate.mediaType === mediaType)
    .map((candidate, index) => {
      const title = titleMatchKey(candidate.title);
      const originalTitle = candidate.originalTitle ? titleMatchKey(candidate.originalTitle) : '';
      let score = title === wantedTitle ? 100 : originalTitle === wantedTitle ? 95 : 0;
      if (!score && (title.includes(wantedTitle) || wantedTitle.includes(title))) score = 45;
      if (wantedYear && candidate.releaseYear)
        score += String(candidate.releaseYear) === wantedYear ? 25 : -10;
      return { candidate, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.candidate;
}

function localDateKey(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarDayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function releaseWindowStartKey(now: Date, historyDays: number): string {
  return calendarDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - historyDays));
}

function favoriteScope(items: readonly MediaItem[]): string {
  return items
    .map((item) => `${item.id}:${titleForTmdb(item)}`)
    .sort()
    .join('|');
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

/**
 * Schedule data for the user's saved movies and series. Each item is cached
 * separately and the batch runner caps parallel work, avoiding a request burst
 * even for a large Favorites library.
 */
export function useUpcomingReleases(hookOptions: UpcomingReleaseOptions = {}) {
  const favorites = useLibraryStore((state) => state.favorites);
  const tmdbEnabled = useSettingsStore((state) => state.tmdbEnabled);
  const tmdbApiKey = useSettingsStore((state) => state.tmdbApiKey);
  const tmdbLanguage = useSettingsStore((state) => state.tmdbLanguage);
  const tmdbIncludeAdult = useSettingsStore((state) => state.tmdbIncludeAdult);
  const tmdbImageSize = useSettingsStore((state) => state.tmdbImageSize);
  const appLanguage = useSettingsStore((state) => state.language);
  const upcomingEnabled = useSettingsStore((state) => state.upcomingEnabled);
  const exactTimesEnabled = useSettingsStore((state) => state.upcomingExactTimesEnabled);
  const historyDays = useSettingsStore((state) => state.upcomingHistoryDays);
  const queryClient = useQueryClient();

  const requestedFavoriteIds = hookOptions.favoriteIds ? new Set(hookOptions.favoriteIds) : null;
  const trackedFavorites = favorites.filter(
    (item) =>
      (item.type === 'series' || item.type === 'vod') &&
      item.title.trim() &&
      (!requestedFavoriteIds || requestedFavoriteIds.has(item.id)),
  );
  const language =
    tmdbLanguage === 'auto' ? uiLanguageDefinition(appLanguage).locale : tmdbLanguage;
  const enabled =
    upcomingEnabled && tmdbEnabled && Boolean(tmdbApiKey.trim()) && trackedFavorites.length > 0;
  const options: TmdbRequestOptions = {
    language,
    includeAdult: tmdbIncludeAdult,
    imageSize: tmdbImageSize,
  };
  const scope = favoriteScope(trackedFavorites);
  const calendarDay = calendarDayKey(new Date());

  return useQuery({
    queryKey: queryKeys.tmdbUpcoming(
      scope,
      language,
      tmdbIncludeAdult,
      tmdbImageSize,
      exactTimesEnabled,
      historyDays,
      calendarDay,
    ),
    enabled,
    staleTime: DETAILS_STALE_TIME,
    retry: 1,
    queryFn: async (): Promise<UpcomingRelease[]> => {
      const windowStart = releaseWindowStartKey(new Date(), historyDays);
      const scheduleEnrichmentFailures: string[] = [];
      const releaseGroups = await mapWithConcurrency<MediaItem, UpcomingRelease[]>(
        trackedFavorites,
        MAX_CONCURRENT_LOOKUPS,
        async (favorite) => {
          const mediaType = favorite.type === 'vod' ? 'movie' : 'tv';
          const search = await queryClient.fetchQuery({
            queryKey: queryKeys.tmdbSearch(
              mediaType,
              titleForTmdb(favorite),
              language,
              tmdbIncludeAdult,
            ),
            staleTime: SEARCH_STALE_TIME,
            retry: 1,
            queryFn: () => searchTmdb(tmdbApiKey, titleForTmdb(favorite), undefined, options),
          });
          const match = selectUpcomingTmdbMatch(favorite, mediaType, search.results);
          if (!match) return [];
          if (mediaType === 'movie') {
            const movie = await queryClient.fetchQuery({
              queryKey: queryKeys.tmdbMovie(match.id, language, tmdbIncludeAdult, tmdbImageSize),
              staleTime: DETAILS_STALE_TIME,
              retry: 1,
              queryFn: () => getTmdbMovie(tmdbApiKey, match.id, undefined, options),
            });
            if (!movie?.releaseDate || movie.releaseDate < windowStart) return [];
            return [
              {
                favorite,
                tmdbId: match.id,
                airDate: movie.releaseDate,
                kind: 'movie',
                title: movie.title,
                seasonNumber: null,
                episodeNumber: null,
                artworkUrl: movie.posterUrl ?? favorite.posterUrl,
                exactAirTime: null,
                timeSource: 'tmdb',
              },
            ];
          }
          const tv = await queryClient.fetchQuery({
            queryKey: queryKeys.tmdbTv(match.id, language, tmdbIncludeAdult, tmdbImageSize),
            staleTime: DETAILS_STALE_TIME,
            retry: 1,
            queryFn: () => getTmdbTv(tmdbApiKey, match.id, undefined, options),
          });
          const nextEpisode = tv?.nextEpisodeToAir;
          const lastEpisode = tv?.lastEpisodeToAir;
          // TVmaze is optional schedule enrichment. One cached request serves
          // both recently aired and announced episodes; failure still falls
          // back to TMDB's latest and next date-only episodes.
          let tvmazeEpisodes: Awaited<ReturnType<typeof getTvmazeEpisodes>> = [];
          if (exactTimesEnabled) {
            try {
              const tvmazeMatches = await queryClient.fetchQuery({
                queryKey: queryKeys.tvmazeSearch(titleForTmdb(favorite)),
                staleTime: SEARCH_STALE_TIME,
                retry: 1,
                queryFn: () => searchTvmazeShows(titleForTmdb(favorite)),
              });
              const tvmazeMatch = tvmazeMatches.find(
                (result) => titleMatchKey(result.name) === titleMatchKey(titleForTmdb(favorite)),
              );
              if (tvmazeMatch) {
                tvmazeEpisodes = await queryClient.fetchQuery({
                  queryKey: queryKeys.tvmazeEpisodes(tvmazeMatch.id),
                  staleTime: TVMAZE_STALE_TIME,
                  retry: 1,
                  queryFn: () => getTvmazeEpisodes(tvmazeMatch.id),
                });
              }
            } catch (error: unknown) {
              scheduleEnrichmentFailures.push(
                `${favorite.title}: ${getErrorMessage(error, 'TVmaze enrichment failed without an error message.')}`,
              );
              // The date-only TMDB next episode remains available as fallback.
            }
          }

          const relevantTvmazeEpisodes = tvmazeEpisodes.filter(
            (tvmazeEpisode) =>
              (localDateKey(tvmazeEpisode.airstamp) ?? tvmazeEpisode.airstamp.slice(0, 10)) >=
              windowStart,
          );
          if (relevantTvmazeEpisodes.length > 0) {
            return relevantTvmazeEpisodes.map((tvmazeEpisode) => ({
              favorite,
              tmdbId: match.id,
              airDate: localDateKey(tvmazeEpisode.airstamp) ?? tvmazeEpisode.airstamp.slice(0, 10),
              kind: 'episode' as const,
              title: tvmazeEpisode.name,
              seasonNumber: tvmazeEpisode.seasonNumber,
              episodeNumber: tvmazeEpisode.episodeNumber,
              artworkUrl: tv?.posterUrl ?? favorite.posterUrl,
              exactAirTime: tvmazeEpisode.airstamp,
              timeSource: 'tvmaze' as const,
            }));
          }

          return [lastEpisode, nextEpisode]
            .filter((episode): episode is NonNullable<typeof episode> =>
              Boolean(episode?.airDate && episode.airDate >= windowStart),
            )
            .filter(
              (episode, index, episodes) =>
                episodes.findIndex((candidate) =>
                  candidate.id !== null && episode.id !== null
                    ? candidate.id === episode.id
                    : candidate.airDate === episode.airDate &&
                      candidate.seasonNumber === episode.seasonNumber &&
                      candidate.episodeNumber === episode.episodeNumber,
                ) === index,
            )
            .map((episode) => ({
              favorite,
              tmdbId: match.id,
              airDate: episode.airDate!,
              kind: 'episode' as const,
              title: episode.name,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              artworkUrl: episode.stillUrl ?? tv?.posterUrl ?? favorite.posterUrl,
              exactAirTime: null,
              timeSource: 'tmdb' as const,
            }));
        },
      );
      if (scheduleEnrichmentFailures.length > 0) {
        notify.warning(
          'Exact Air Times Unavailable',
          `Date-only TMDB schedule data is shown.\n${scheduleEnrichmentFailures.join('\n')}`,
          undefined,
          undefined,
          'connection',
        );
      }
      return releaseGroups
        .flat()
        .filter((release) => release.airDate >= windowStart)
        .sort(
          (left, right) =>
            left.airDate.localeCompare(right.airDate) ||
            (left.exactAirTime ?? '').localeCompare(right.exactAirTime ?? '') ||
            left.favorite.title.localeCompare(right.favorite.title),
        );
    },
  });
}
