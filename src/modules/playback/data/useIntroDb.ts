import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';
import { getTmdbTvExternalIds } from '@/modules/metadata/public/data/tmdbClient';
import { fetchTmdbTitleMatch } from '@/modules/metadata/public/data/tmdbTitleLookup';
import { searchTvmazeShows } from '@/modules/metadata/public/data/tvMazeClient';
import { useTmdbLookupSettings } from '@/modules/metadata/public/hooks/useTmdbLookupSettings';
import { selectTmdbMatch, tmdbTitleKey } from '@/modules/metadata/public/model/tmdbMatch';
import { fetchIntroDbSegments, type IntroDbSegments } from './introDbClient';
import { queryKeys } from '@/modules/sources/public/model/queryKeys';
import { parseMediaDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import { getErrorMessage } from '@/shared/lib/error';

const INTRODB_STALE_TIME = 1000 * 60 * 60 * 24; // 24 hours
const INTRODB_GC_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days

const EMPTY_SEGMENTS: IntroDbSegments = {
  intro: null,
  recap: null,
  outro: null,
};

/** What is known about the series an episode belongs to. */
export interface IntroDbSeries {
  /** Display title; provider prefixes and tags are removed here. */
  title?: string | null | undefined;
  /** First air year, when the provider dates the series. */
  year?: number | null | undefined;
  /** The provider's TMDB id for the series, checked before it is used. */
  tmdbId?: number | null | undefined;
}

function parsePositiveInteger(value: string | number | undefined | null): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * The series' IMDb id, the only key IntroDB knows.
 *
 * TMDB goes first when it is set up: it takes the provider's own id and knows
 * translated titles ("Haus des Geldes"). TVmaze needs no key but only knows a
 * show's main name. Either way a show only counts when its name — and its
 * premiere year, when known — is this series: the first search hit would pin
 * another show's intro onto it. Throws when a source failed and nothing was
 * found, so an outage is not remembered as "no timestamps".
 */
async function resolveImdbId(
  queryClient: QueryClient,
  tmdb: ReturnType<typeof useTmdbLookupSettings>,
  series: { title: string; year: number | null; tmdbId: number | null },
): Promise<string | null> {
  const failures: string[] = [];

  if (tmdb.enabled) {
    try {
      const match = await fetchTmdbTitleMatch(
        queryClient,
        tmdb.apiKey,
        { mediaType: 'tv', ...series },
        tmdb.options,
      );
      if (match) {
        const externalIds = await queryClient.ensureQueryData({
          queryKey: queryKeys.tmdbExternalIds(match.id),
          queryFn: ({ signal }) => getTmdbTvExternalIds(tmdb.apiKey, match.id, signal),
          staleTime: INTRODB_STALE_TIME,
          gcTime: INTRODB_GC_TIME,
        });
        if (externalIds.imdbId) return externalIds.imdbId;
      }
    } catch (error) {
      failures.push(getErrorMessage(error, 'TMDB lookup failed.'));
    }
  }

  try {
    const shows = await queryClient.ensureQueryData({
      queryKey: queryKeys.tvmazeSearch(series.title),
      queryFn: ({ signal }) => searchTvmazeShows(series.title, signal),
      staleTime: INTRODB_STALE_TIME,
      gcTime: INTRODB_GC_TIME,
    });
    const match = selectTmdbMatch(
      { title: series.title, year: series.year },
      shows.flatMap((show) =>
        show.externals.imdb
          ? [{ title: show.name, releaseYear: show.premieredYear, imdbId: show.externals.imdb }]
          : [],
      ),
    );
    if (match) return match.imdbId;
    debugLog.info('api', `IntroDB: no show matching "${series.title}"`, {
      year: series.year,
      candidates: shows.slice(0, 5).map((show) => show.name),
    });
  } catch (error) {
    failures.push(getErrorMessage(error, 'TVmaze lookup failed.'));
  }

  if (failures.length > 0) throw new Error(`IntroDB series lookup failed: ${failures.join('; ')}`);
  return null;
}

/**
 * Fetch crowdsourced intro/recap/outro timestamps from IntroDB for one
 * episode. Each lookup step is cached on its own.
 */
export function useIntroDbSegments(
  series: IntroDbSeries,
  seasonNum?: string | number | null,
  episodeNum?: string | number | null,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const tmdb = useTmdbLookupSettings();
  const introDbEnabled = useSettingsStore((s) => s.introDbEnabled);

  const parsed = series.title ? parseMediaDisplayTitle(series.title) : null;
  const title = (parsed?.cleanTitle || series.title || '').trim();
  const year = series.year ?? (parsed?.releaseYear ? Number(parsed.releaseYear) : null);
  const tmdbId = series.tmdbId ?? null;
  const season = parsePositiveInteger(seasonNum);
  const episode = parsePositiveInteger(episodeNum);

  const isEligible =
    enabled && introDbEnabled && Boolean(title) && season !== null && episode !== null;

  return useQuery<IntroDbSegments>({
    queryKey: [
      'introdb_pipeline',
      tmdbTitleKey(title),
      year,
      tmdbId,
      season,
      episode,
      tmdb.enabled,
      tmdb.options.language,
    ],
    queryFn: async () => {
      if (!isEligible || season === null || episode === null) return EMPTY_SEGMENTS;

      const imdbId = await resolveImdbId(queryClient, tmdb, { title, year, tmdbId });
      if (!imdbId) return EMPTY_SEGMENTS;

      const segments = await queryClient.ensureQueryData({
        queryKey: queryKeys.introDbSegments(imdbId, season, episode),
        queryFn: () => fetchIntroDbSegments(imdbId, season, episode),
        staleTime: INTRODB_STALE_TIME,
        gcTime: INTRODB_GC_TIME,
      });
      debugLog.info(
        'api',
        `IntroDB: fetched segments for ${imdbId} S${season}E${episode}`,
        segments,
      );
      return segments;
    },
    enabled: isEligible,
    staleTime: INTRODB_STALE_TIME,
    gcTime: INTRODB_GC_TIME,
    retry: false,
  });
}
