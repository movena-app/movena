import type { XtreamCredentials } from './xtream';
import type { CatalogType } from '@/modules/settings/public/store/useSettingsStore';

/** Stable, non-secret cache scope. Prevents one provider account reusing another's data. */
export function getAuthQueryScope(credentials: XtreamCredentials | null | undefined): string {
  if (!credentials) return 'anonymous';
  const servers = [
    ...new Set(
      [credentials.url, ...(credentials.alternativeUrls ?? [])]
        .filter(Boolean)
        .map((url) => url.replace(/\/+$/, '').toLowerCase()),
    ),
  ]
    .sort()
    .join(',');
  const identity = `${servers}|${credentials.username.trim().toLowerCase()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `account-${(hash >>> 0).toString(36)}`;
}

export function getM3uQueryScope(sourceId: string, revision: number): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceId.length; index += 1) {
    hash ^= sourceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const safeRevision = Number.isFinite(revision) ? Math.max(0, Math.floor(revision)) : 0;
  return `playlist-${(hash >>> 0).toString(36)}-${safeRevision}`;
}

/** Source-scoped even when the same provider login is intentionally added twice. */
export function getXtreamQueryScope(
  sourceId: string | undefined,
  credentials: XtreamCredentials | null | undefined,
): string {
  return getCombinedSourceQueryScope([
    getAuthQueryScope(credentials),
    `xtream-id:${sourceId || 'legacy'}`,
  ]);
}

export function getUrlQueryScope(value: string): string {
  let hash = 0x811c9dc5;
  const normalized = value.trim();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `url-${(hash >>> 0).toString(36)}`;
}

export function getCombinedSourceQueryScope(scopes: readonly string[]): string {
  let hash = 0x811c9dc5;
  const identity = [...scopes].sort().join('|');
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `sources-${(hash >>> 0).toString(36)}`;
}

export const queryKeys = {
  catalog: (type: CatalogType, authScope: string) => ['catalog', type, authScope] as const,
  categories: (type: CatalogType, authScope: string) => ['categories', type, authScope] as const,
  vodInfo: (id: string | number | undefined, authScope: string) =>
    ['vod_info', authScope, id?.toString()] as const,
  seriesInfo: (id: string | number | undefined, authScope: string) =>
    ['series_info', authScope, id?.toString()] as const,
  channelEpg: (streamId: string | undefined, authScope: string) =>
    ['epg_channel', authScope, streamId] as const,
  shortEpg: (streamId: string | number | undefined, authScope: string) =>
    ['epg_short', authScope, streamId?.toString()] as const,
  /** TMDB keys deliberately exclude API keys and source URLs. */
  tmdbSearch: (mediaType: 'movie' | 'tv', title: string, language: string, includeAdult: boolean) =>
    ['tmdb_search', mediaType, title.trim().toLocaleLowerCase(), language, includeAdult] as const,
  tmdbTv: (id: number, language: string, includeAdult: boolean, imageSize: string) =>
    ['tmdb_tv', id, language, includeAdult, imageSize] as const,
  tmdbMovie: (id: number, language: string, includeAdult: boolean, imageSize: string) =>
    ['tmdb_movie', id, language, includeAdult, imageSize] as const,
  tmdbUpcoming: (
    favoriteScope: string,
    language: string,
    includeAdult: boolean,
    imageSize: string,
    exactTimes: boolean,
    historyDays: number,
    calendarDay: string,
  ) =>
    [
      'tmdb_upcoming',
      favoriteScope,
      language,
      includeAdult,
      imageSize,
      exactTimes,
      historyDays,
      calendarDay,
    ] as const,
  tvmazeSearch: (title: string) => ['tvmaze_search', title.trim().toLocaleLowerCase()] as const,
  tvmazeEpisodes: (showId: number) => ['tvmaze_episodes_v3', showId] as const,
  tmdbExternalIds: (tmdbId: number) => ['tmdb_external_ids', tmdbId] as const,
  introDbSegments: (imdbId: string, season: number, episode: number) =>
    ['introdb_segments', imdbId, season, episode] as const,
};
