import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  getLiveStreams,
  getSeries,
  getStreamUrl,
  getVodStreams,
} from '@/modules/sources/public/data/xtreamClient';
import type { MediaItem } from '../model/media';
import { queryKeys } from '@/modules/sources/public/model/queryKeys';
import { parseLiveChannelTitle, parseMediaDisplayTitle, parseMediaTitle } from '../lib/titleParser';
import {
  useEnabledSources,
  type EnabledSourcesSnapshot,
  type EnabledXtreamSource,
} from '@/modules/sources/public/hooks/useEnabledSources';
import {
  getM3uSeriesGroups,
  type M3uEntry,
  type M3uPlaylist,
} from '@/modules/sources/public/data/m3uClient';
import { xtreamCategoryId, xtreamItemId } from '@/modules/sources/public/lib/sourceIdentity';
import { foldLiveChannels } from '../lib/streamFolding';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';

export interface CatalogItem extends MediaItem {
  categoryId?: string | undefined;
  /** The source's guide id for a channel — how XMLTV listings are matched. */
  epgChannelId?: string | undefined;
  radio?: boolean | undefined;
  radioMetadata?:
    | {
        title: string;
        artist?: string | undefined;
        album?: string | undefined;
        genre?: string | undefined;
        channelNumber?: string | undefined;
        logoUrl?: string | undefined;
      }
    | undefined;
  catchup?: string | undefined;
  catchupSource?: string | undefined;
  catchupDays?: number | undefined;
  fallbacks?:
    Array<{ streamUrl: string; httpHeaders?: Record<string, string> | undefined }> | undefined;
}

const foldedLiveCatalogs = new WeakMap<CatalogItem[], CatalogItem[]>();

/** Share the expensive stream-folding result across every observer of one catalog. */
export function selectFoldedLiveCatalog(data: CatalogItem[]): CatalogItem[] {
  const cached = foldedLiveCatalogs.get(data);
  if (cached) return cached;
  const folded = foldLiveChannels(data) as CatalogItem[];
  foldedLiveCatalogs.set(data, folded);
  return folded;
}

function m3uEntryItem(entry: M3uEntry, sourceName?: string): CatalogItem {
  const liveMetadata = entry.type === 'live' ? parseLiveChannelTitle(entry.title) : null;
  const mediaMetadata = entry.type === 'live' ? null : parseMediaTitle(entry.title);
  return {
    id: entry.id,
    sourceItemId: entry.id,
    title: entry.title,
    posterUrl: entry.logo || '',
    type: entry.type === 'series' ? 'series' : entry.type,
    channelNum: entry.channelNumber,
    year: entry.year,
    rating: entry.rating,
    categoryId: entry.categoryId,
    epgChannelId: entry.tvgId,
    tags: liveMetadata?.qualityBadges ?? mediaMetadata?.tags,
    country: liveMetadata?.country ?? mediaMetadata?.country,
    streamUrl: entry.url,
    httpHeaders: entry.headers,
    sourceId: entry.sourceId,
    subtitle: sourceName,
    description: entry.description,
    radio: entry.radio,
    radioMetadata: entry.radioMetadata,
    catchup: entry.catchup,
    catchupSource: entry.catchupSource,
    catchupDays: entry.catchupDays,
    containerExtension: entry.url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1],
  };
}

export function mapM3uCatalog(
  playlist: M3uPlaylist,
  type: 'live' | 'vod' | 'series',
  sourceName?: string,
): CatalogItem[] {
  if (type !== 'series') {
    return playlist.entries
      .filter((entry) => entry.type === type)
      .map((entry) => m3uEntryItem(entry, sourceName));
  }
  return [...getM3uSeriesGroups(playlist).entries()].map(([id, episodes]) => {
    const first = episodes[0]!;
    const title = first.episode?.seriesTitle || first.title;
    const metadata = parseMediaTitle(title);
    return {
      id,
      sourceItemId: id,
      title,
      posterUrl: first.logo || '',
      type: 'series',
      rating: first.rating,
      year: first.year,
      categoryId: first.categoryId,
      tags: metadata.tags,
      country: metadata.country,
      sourceId: first.sourceId,
      subtitle: sourceName,
      description: first.description,
    };
  });
}

export function catalogQueryOptions(
  type: 'live' | 'vod' | 'series',
  sources: EnabledSourcesSnapshot,
) {
  return queryOptions({
    queryKey: queryKeys.catalog(type, sources.queryScope),
    queryFn: async ({ signal }): Promise<CatalogItem[]> => {
      const playlistItems = sources.availableM3uSources.flatMap((source) =>
        source.runtime?.playlist
          ? mapM3uCatalog(source.runtime.playlist, type, source.profile.name)
          : [],
      );
      const results = await Promise.allSettled(
        sources.availableXtreamSources.map((source) =>
          type === 'live'
            ? liveFromXtream(source, signal)
            : type === 'vod'
              ? vodFromXtream(source, signal)
              : seriesFromXtream(source, signal),
        ),
      );
      const providerItems = successful(results);
      const providerFailures = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [
              `${sources.availableXtreamSources[index]?.profile.name ?? `Source ${index + 1}`}: ${getErrorMessage(result.reason, 'Request failed without an error message.')}`,
            ]
          : [],
      );
      const failedProviders = providerFailures.length;
      if (!playlistItems.length && results.length > 0 && failedProviders === results.length) {
        throw new Error(providerFailures.join('\n'));
      }
      if (failedProviders > 0 && (providerItems.length > 0 || playlistItems.length > 0)) {
        notify.warning(
          'Some Sources Unavailable',
          `${failedProviders} enabled source${failedProviders === 1 ? '' : 's'} could not load. Results from the remaining sources are shown.\n${providerFailures.join('\n')}`,
          undefined,
          undefined,
          'connection',
        );
      }
      return [...providerItems, ...playlistItems];
    },
    // Source mutations explicitly invalidate these queries. Keep route changes
    // from turning into provider reloads and main-thread remapping work.
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 12,
    retry: false,
  });
}

export function isCatalogAvailable(
  type: 'live' | 'vod' | 'series',
  sources: EnabledSourcesSnapshot,
): boolean {
  void type;
  return sources.isAvailable;
}

function successful<T>(results: PromiseSettledResult<T[]>[]): T[] {
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

async function liveFromXtream(
  source: EnabledXtreamSource,
  signal?: AbortSignal,
): Promise<CatalogItem[]> {
  const credentials = source.credentials!;
  const response = await getLiveStreams(credentials, undefined, signal);
  if (!Array.isArray(response)) return [];
  return response.map((stream, index) => {
    const title = stream.name || 'Unknown Channel';
    const metadata = parseLiveChannelTitle(title);
    const providerId = (
      stream.stream_id ??
      stream.epg_channel_id ??
      stream.num ??
      `live-${index}`
    ).toString();
    return {
      id: xtreamItemId(source.id, 'live', providerId),
      sourceItemId: providerId,
      title,
      posterUrl: stream.stream_icon || '',
      type: 'live',
      channelNum: stream.num ?? index + 1,
      added: stream.added,
      categoryId: xtreamCategoryId(source.id, stream.category_id),
      epgChannelId: stream.epg_channel_id || undefined,
      tags: metadata.qualityBadges,
      country: metadata.country,
      streamUrl: stream.direct_source || getStreamUrl(credentials, 'live', providerId),
      fallbacks: stream.direct_source
        ? [{ streamUrl: getStreamUrl(credentials, 'live', providerId) }]
        : undefined,
      catchup: stream.tv_archive === 1 ? 'xtream' : undefined,
      catchupDays: stream.tv_archive_duration,
      sourceId: source.id,
      subtitle: source.profile.name,
      radio:
        stream.stream_type?.toLowerCase() === 'audio' ||
        stream.stream_type?.toLowerCase() === 'radio',
      radioMetadata:
        stream.stream_type?.toLowerCase() === 'audio' ||
        stream.stream_type?.toLowerCase() === 'radio'
          ? { title }
          : undefined,
    };
  });
}

async function vodFromXtream(
  source: EnabledXtreamSource,
  signal?: AbortSignal,
): Promise<CatalogItem[]> {
  const credentials = source.credentials!;
  const streams = await getVodStreams(credentials, undefined, signal);
  if (!Array.isArray(streams)) return [];
  return streams.map((stream, index) => {
    const title = stream.name || 'Unknown Movie';
    const metadata = parseMediaDisplayTitle(title);
    const providerId = (stream.stream_id ?? stream.num ?? `movie-${index}`).toString();
    let rating: number | undefined;
    if (stream.rating && !Number.isNaN(Number.parseFloat(stream.rating))) {
      const r = Number.parseFloat(stream.rating);
      if (r > 0) rating = r <= 5 ? Math.round(r * 20) / 10 : Math.round(r * 10) / 10;
    } else if (typeof stream.rating_5based === 'number' && stream.rating_5based > 0) {
      rating = Math.round(stream.rating_5based * 20) / 10;
    }
    return {
      id: xtreamItemId(source.id, 'vod', providerId),
      sourceItemId: providerId,
      title,
      posterUrl: stream.stream_icon || '',
      type: 'vod',
      rating,
      year: metadata.releaseYear || undefined,
      added: stream.added,
      categoryId: xtreamCategoryId(source.id, stream.category_id),
      tags: metadata.tags,
      country: metadata.country,
      streamUrl:
        stream.direct_source ||
        getStreamUrl(credentials, 'vod', providerId, stream.container_extension || 'mp4'),
      containerExtension: stream.container_extension,
      sourceId: source.id,
      subtitle: source.profile.name,
    };
  });
}

async function seriesFromXtream(
  source: EnabledXtreamSource,
  signal?: AbortSignal,
): Promise<CatalogItem[]> {
  const streams = await getSeries(source.credentials!, undefined, signal);
  if (!Array.isArray(streams)) return [];
  return streams.map((stream, index) => {
    let year: string | undefined;
    if (stream.releaseDate) {
      const parsed = new Date(stream.releaseDate).getFullYear();
      if (!Number.isNaN(parsed)) year = parsed.toString();
    }
    const title = stream.name || 'Unknown Series';
    const metadata = parseMediaDisplayTitle(title, year);
    const providerId = (stream.series_id ?? stream.num ?? `series-${index}`).toString();
    let rating: number | undefined;
    if (stream.rating && !Number.isNaN(Number.parseFloat(stream.rating))) {
      const r = Number.parseFloat(stream.rating);
      if (r > 0) rating = r <= 5 ? Math.round(r * 20) / 10 : Math.round(r * 10) / 10;
    } else if (typeof stream.rating_5based === 'number' && stream.rating_5based > 0) {
      rating = Math.round(stream.rating_5based * 20) / 10;
    }
    return {
      id: xtreamItemId(source.id, 'series', providerId),
      sourceItemId: providerId,
      title,
      posterUrl: stream.cover || '',
      type: 'series',
      rating,
      year: year ?? metadata.releaseYear ?? undefined,
      added: stream.last_modified,
      categoryId: xtreamCategoryId(source.id, stream.category_id),
      tags: metadata.tags,
      country: metadata.country,
      genre: stream.genre,
      sourceId: source.id,
      subtitle: source.profile.name,
      description: stream.plot,
    };
  });
}

export function useLiveStreams(options?: { enabled?: boolean | undefined }) {
  const sources = useEnabledSources();
  const streamFoldingEnabled = useSettingsStore((s) => s.streamFoldingEnabled);
  return useQuery({
    ...catalogQueryOptions('live', sources),
    enabled: sources.isAvailable && (options?.enabled ?? true),
    ...(streamFoldingEnabled ? { select: selectFoldedLiveCatalog } : {}),
  });
}

export function useVodStreams(options?: { enabled?: boolean | undefined }) {
  const sources = useEnabledSources();
  return useQuery({
    ...catalogQueryOptions('vod', sources),
    enabled: sources.isAvailable && (options?.enabled ?? true),
  });
}

export function useSeriesList(options?: { enabled?: boolean | undefined }) {
  const sources = useEnabledSources();
  return useQuery({
    ...catalogQueryOptions('series', sources),
    enabled: sources.isAvailable && (options?.enabled ?? true),
  });
}

/** Picks the catalogue that belongs to a category sidebar's type. */
export function useCatalogByType(type: 'live' | 'vod' | 'series') {
  const live = useLiveStreams({ enabled: type === 'live' });
  const vod = useVodStreams({ enabled: type === 'vod' });
  const series = useSeriesList({ enabled: type === 'series' });
  return type === 'live' ? live : type === 'vod' ? vod : series;
}
