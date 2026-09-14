import type { XtreamCredentials, XtreamServerInfo, XtreamUserInfo } from '../model/xtream';

// Helper to normalize the URL (remove trailing slashes, add player_api.php)
const getApiUrl = (baseUrl: string) => {
  const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${url}/player_api.php`;
};

// Helper to construct playback URL
export const getStreamUrl = (
  creds: XtreamCredentials,
  type: 'live' | 'vod' | 'series',
  streamId: string | number,
  extension?: string,
) => {
  const url = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  const username = encodeURIComponent(creds.username);
  const password = encodeURIComponent(creds.password);
  const id = encodeURIComponent(String(streamId));
  if (type === 'live') {
    // Providers generally expose live streams as HLS; native mpv handles them directly.
    return `${url}/live/${username}/${password}/${id}.m3u8`;
  } else {
    // For VOD/Series, it's URL/type/user/pass/id.ext
    // XTream codes expects 'movie' for VOD streams, not 'vod'
    const pathType = type === 'vod' ? 'movie' : type;
    const ext = extension ? `.${encodeURIComponent(extension.replace(/^\./, ''))}` : '.mp4';
    return `${url}/${pathType}/${username}/${password}/${id}${ext}`;
  }
};

import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { useDebugStore, debugLog } from '@/modules/diagnostics/public/store/useDebugStore';
import { promoteXtreamServer } from '../services/xtreamServerEvents';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';

/** Provider requests fail quickly enough to keep modal and page states responsive. */
export const PROVIDER_PRIMARY_TIMEOUT_MS = 5_000;
export const PROVIDER_FAILOVER_BUDGET_MS = 8_000;

export async function testServerLatency(
  serverUrl: string,
  username: string,
  password: string,
): Promise<number> {
  let validUrl = serverUrl.trim();
  if (!/^https?:\/\//i.test(validUrl)) {
    validUrl = `https://${validUrl}`;
  }
  const apiUrl = new URL(getApiUrl(validUrl));
  apiUrl.searchParams.append('username', username.trim());
  apiUrl.searchParams.append('password', password.trim());

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5000);
  const start = Date.now();

  try {
    const res = await fetch(apiUrl.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.user_info || data.user_info.auth !== 1) {
      throw new Error('Auth failed');
    }
    return Date.now() - start;
  } catch (error: unknown) {
    if (timedOut) throw new Error('Server latency test timed out after 5000 ms.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Single URL fetcher
async function fetchSingleXC<T>(
  baseUrl: string,
  creds: XtreamCredentials,
  extraParams: Record<string, string> = {},
  signal?: AbortSignal,
  timeoutMs = PROVIDER_PRIMARY_TIMEOUT_MS,
): Promise<T> {
  const settings = useSettingsStore.getState();
  const startTime = Date.now();

  if (signal?.aborted)
    throw (
      signal.reason ??
      Object.assign(new Error('Provider request cancelled'), { name: 'AbortError' })
    );

  const url = new URL(getApiUrl(baseUrl));
  url.searchParams.append('username', creds.username);
  url.searchParams.append('password', creds.password);

  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.append(key, value);
  }

  const sanitizedUrl = url.toString().replace(/password=[^&]+/gi, 'password=***');
  const actionName = extraParams.action || 'auth';

  const requestController = new AbortController();
  let timedOut = false;
  const forwardAbort = () => requestController.abort(signal?.reason);
  if (signal?.aborted) requestController.abort(signal.reason);
  else signal?.addEventListener('abort', forwardAbort, { once: true });
  const requestTimeout = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: requestController.signal });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const timeoutSeconds = Number.isInteger(timeoutMs / 1000)
      ? `${timeoutMs / 1000}`
      : (timeoutMs / 1000).toFixed(1);
    const technicalCause = getErrorMessage(error, 'Fetch rejected without an error message.');
    const message = timedOut
      ? `Provider request timed out after ${timeoutSeconds}s`
      : signal?.aborted
        ? 'Provider request cancelled'
        : `Network connection to provider failed: ${technicalCause}`;
    if (settings.debugMode && settings.logApiRequests) {
      useDebugStore.getState().addNetworkLog({
        url: sanitizedUrl,
        method: 'GET',
        durationMs,
        error: message,
      });
    }
    debugLog.warn('api', `${actionName}: ${message}`, { durationMs });
    if (signal?.aborted) throw error;
    throw new Error(message);
  } finally {
    clearTimeout(requestTimeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
  const durationMs = Date.now() - startTime;
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    if (settings.debugMode && settings.logApiRequests) {
      useDebugStore.getState().addNetworkLog({
        url: sanitizedUrl,
        method: 'GET',
        status: response.status,
        durationMs,
        contentType,
        error: `${response.status} ${response.statusText}`,
      });
    }
    const errText = `XC API Error: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    debugLog.error('api', errText, { status: response.status, url: sanitizedUrl });
    throw new Error(errText);
  }

  if (contentType.includes('text/html')) {
    if (settings.debugMode && settings.logApiRequests) {
      useDebugStore.getState().addNetworkLog({
        url: sanitizedUrl,
        method: 'GET',
        status: response.status,
        durationMs,
        contentType,
        error: 'Returned HTML instead of JSON',
      });
    }
    throw new Error('XC API Returned HTML error page instead of JSON');
  }

  let data: T;
  try {
    data = await response.json();
  } catch {
    if (settings.debugMode && settings.logApiRequests) {
      useDebugStore.getState().addNetworkLog({
        url: sanitizedUrl,
        method: 'GET',
        status: response.status,
        durationMs,
        contentType,
        error: 'Invalid JSON response',
      });
    }
    throw new Error('XC API returned an invalid JSON response');
  }

  if (settings.debugMode && settings.logApiRequests) {
    const raw = JSON.stringify(data);
    const MAX_PREVIEW = 2000;
    useDebugStore.getState().addNetworkLog({
      url: sanitizedUrl,
      method: 'GET',
      status: response.status,
      durationMs,
      contentType,
      responseSize: raw.length,
      responsePreview:
        raw.length > MAX_PREVIEW
          ? raw.slice(0, MAX_PREVIEW) + `\n… (${(raw.length / 1024).toFixed(1)} KB total)`
          : raw,
    });
    debugLog.info('api', `XC API Request [${actionName}] -> ${response.status}`, {
      durationMs,
      action: actionName,
      responseSize: raw.length,
    });
  }

  return data;
}

// Generic fetch wrapper for XC API with automatic alternative server fallback
async function fetchXtream<T>(
  creds: XtreamCredentials,
  extraParams: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const urlsToTry = [creds.url, ...(creds.alternativeUrls || [])].filter(Boolean);
  const failoverStartedAt = Date.now();

  const failures: string[] = [];
  for (const [index, currentUrl] of urlsToTry.entries()) {
    const remainingBudget = PROVIDER_FAILOVER_BUDGET_MS - (Date.now() - failoverStartedAt);
    if (remainingBudget <= 0) break;
    const timeoutMs = Math.min(
      currentUrl === creds.url ? PROVIDER_PRIMARY_TIMEOUT_MS : 3_000,
      remainingBudget,
    );
    try {
      const data = await fetchSingleXC<T>(currentUrl, creds, extraParams, signal, timeoutMs);
      if (currentUrl !== creds.url) {
        promoteXtreamServer(creds.sourceId, currentUrl);
        notify.info(
          'Backup Server Active',
          'Movena switched this source to an available provider server.',
          4500,
          undefined,
          'connection',
        );
      }
      return data;
    } catch (error: unknown) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      let serverLabel = `Configured server ${index + 1}`;
      try {
        serverLabel = new URL(currentUrl).host || serverLabel;
      } catch {
        /* The failure below includes invalid URL details. */
      }
      failures.push(
        `${serverLabel}: ${getErrorMessage(error, 'Request failed without an error message.')}`,
      );
    }
  }

  throw new Error(
    failures.length > 0
      ? failures.join('\n')
      : 'Failed to connect to any configured XC server: no server request was attempted.',
  );
}

// 1. Authenticate
export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info: XtreamServerInfo;
}

export async function authenticateXtream(creds: XtreamCredentials): Promise<XtreamAuthResponse> {
  const data = await fetchXtream<XtreamAuthResponse>(creds);
  if (!data.user_info || data.user_info.auth !== 1) {
    throw new Error('Invalid credentials or account expired.');
  }
  return data;
}

// 2. Fetch VOD (Movies) Categories
export interface XtreamVodCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}
export async function getVodCategories(
  creds: XtreamCredentials,
  signal?: AbortSignal,
): Promise<XtreamVodCategory[]> {
  return fetchXtream<XtreamVodCategory[]>(creds, { action: 'get_vod_categories' }, signal);
}

// 3. Fetch VOD Streams
export interface XtreamVodStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
}
export async function getVodStreams(
  creds: XtreamCredentials,
  categoryId?: string,
  signal?: AbortSignal,
): Promise<XtreamVodStream[]> {
  const params: Record<string, string> = { action: 'get_vod_streams' };
  if (categoryId) params.category_id = categoryId;
  return fetchXtream<XtreamVodStream[]>(creds, params, signal);
}

// 3b. Fetch VOD Info
export interface XtreamVodInfo {
  info: {
    movie_image: string;
    backdrop_path: string[];
    name: string;
    description: string;
    plot: string;
    genre: string;
    releaseDate: string;
    director: string;
    cast: string;
    rating: string;
    duration: string;
    youtube_trailer: string;
  };
  movie_data: {
    stream_id: string | number;
    name: string;
    added: string;
    container_extension: string;
    direct_stream_url?: string | undefined;
    http_headers?: Record<string, string> | undefined;
    source_id?: string | undefined;
  };
}

export async function getVodInfo(
  creds: XtreamCredentials,
  vodId: string | number,
  signal?: AbortSignal,
): Promise<XtreamVodInfo> {
  return fetchXtream<XtreamVodInfo>(
    creds,
    { action: 'get_vod_info', vod_id: vodId.toString() },
    signal,
  );
}

// 4. Fetch Series Categories
export interface XtreamSeriesCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}
export async function getSeriesCategories(
  creds: XtreamCredentials,
  signal?: AbortSignal,
): Promise<XtreamSeriesCategory[]> {
  return fetchXtream<XtreamSeriesCategory[]>(creds, { action: 'get_series_categories' }, signal);
}

// 5. Fetch Series
export interface XtreamSeries {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}
export async function getSeries(
  creds: XtreamCredentials,
  categoryId?: string,
  signal?: AbortSignal,
): Promise<XtreamSeries[]> {
  const params: Record<string, string> = { action: 'get_series' };
  if (categoryId) params.category_id = categoryId;
  return fetchXtream<XtreamSeries[]>(creds, params, signal);
}

// 5b. Fetch Series Info (Seasons and Episodes)
export interface XtreamEpisode {
  id: string | number;
  episode_num: string | number;
  title?: string | undefined;
  container_extension?: string | undefined;
  info?:
    | {
        plot?: string | undefined;
        duration_secs?: number | undefined;
        duration?: string | undefined;
        movie_image?: string | undefined;
        rating?: string | undefined;
      }
    | undefined;
  custom_sid?: string | undefined;
  added?: string | undefined;
  season?: number | undefined;
  direct_source?: string | undefined;
  stream_url?: string | undefined;
  http_headers?: Record<string, string> | undefined;
  source_id?: string | undefined;
}

interface XtreamSeriesMetadata {
  name?: string | undefined;
  cover?: string | undefined;
  plot?: string | undefined;
  cast?: string | undefined;
  director?: string | undefined;
  genre?: string | undefined;
  releaseDate?: string | undefined;
  rating?: string | undefined;
  backdrop_path?: string[] | undefined;
}

interface XtreamSeason {
  id?: string | number | undefined;
  name?: string | undefined;
  season_number?: number | undefined;
  episode_count?: number | undefined;
  cover?: string | undefined;
}

export interface XtreamSeriesInfoResponse {
  seasons: XtreamSeason[];
  info: XtreamSeriesMetadata;
  episodes: Record<string, XtreamEpisode[]>;
}

export async function getSeriesInfo(
  creds: XtreamCredentials,
  seriesId: string,
  signal?: AbortSignal,
): Promise<XtreamSeriesInfoResponse> {
  return fetchXtream<XtreamSeriesInfoResponse>(
    creds,
    { action: 'get_series_info', series_id: seriesId },
    signal,
  );
}

// 6. Fetch Live Categories
export interface XtreamLiveCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}
export async function getLiveCategories(
  creds: XtreamCredentials,
  signal?: AbortSignal,
): Promise<XtreamLiveCategory[]> {
  return fetchXtream<XtreamLiveCategory[]>(creds, { action: 'get_live_categories' }, signal);
}

// 7. Fetch Live Streams
export interface XtreamLiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}
export async function getLiveStreams(
  creds: XtreamCredentials,
  categoryId?: string,
  signal?: AbortSignal,
): Promise<XtreamLiveStream[]> {
  const params: Record<string, string> = { action: 'get_live_streams' };
  if (categoryId) params.category_id = categoryId;
  return fetchXtream<XtreamLiveStream[]>(creds, params, signal);
}

// 8. Fetch Short EPG
export interface XtreamEpgListing {
  id: string;
  epg_id: string;
  title: string;
  lang: string;
  start: string;
  end: string;
  description: string;
  channel_id: string;
  start_timestamp: number | string;
  stop_timestamp: number | string;
}

export interface XtreamShortEpgResponse {
  epg_listings: XtreamEpgListing[];
}

/**
 * A channel's full guide — roughly a day either side of now, in one request.
 *
 * Measured against the provider: the same 13 listings covering 25.7 hours that
 * `get_short_epg` needs a high limit to approach, in the same ~90ms. The short
 * endpoint stays for the player's "now playing" line, where one entry is all
 * that is wanted.
 */
export async function getChannelEPG(
  creds: XtreamCredentials,
  streamId: string | number,
  signal?: AbortSignal,
): Promise<XtreamEpgListing[]> {
  const res = await fetchXtream<XtreamShortEpgResponse>(
    creds,
    {
      action: 'get_simple_data_table',
      stream_id: streamId.toString(),
    },
    signal,
  );
  return Array.isArray(res?.epg_listings) ? res.epg_listings : [];
}

export async function getShortEPG(
  creds: XtreamCredentials,
  streamId: string | number,
  limit: number = 2,
  signal?: AbortSignal,
): Promise<XtreamShortEpgResponse> {
  return fetchXtream<XtreamShortEpgResponse>(
    creds,
    {
      action: 'get_short_epg',
      stream_id: streamId.toString(),
      limit: limit.toString(),
    },
    signal,
  );
}
