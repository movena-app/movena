import { parseMediaDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import {
  findTvmazeEpisodes,
  normalizeTvmazeShowSearch,
  type NormalizedTvmazeEpisode,
  type NormalizedTvmazeShow,
} from '../model/tvMaze';

const TVMAZE_API = 'https://api.tvmaze.com';

/** Strip provider decorations and a trailing year before a TVmaze search. */
export function cleanTvmazeSearchTitle(title: string): string {
  return parseMediaDisplayTitle(title).cleanTitle.trim();
}

async function tvmazeRequest(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(new URL(path, TVMAZE_API), {
    ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      `TVmaze request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''})`,
    );
  return response.json();
}

/** Search TVmaze shows by the canonical clean display title. */
export async function searchTvmazeShows(
  query: string,
  signal?: AbortSignal,
): Promise<NormalizedTvmazeShow[]> {
  const title = cleanTvmazeSearchTitle(query);
  if (!title) return [];
  const url = new URL('/search/shows', TVMAZE_API);
  url.searchParams.set('q', title);
  const response = await fetch(url, {
    ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      `TVmaze request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''})`,
    );
  return normalizeTvmazeShowSearch(await response.json());
}

/** Fetch one show's complete normalized schedule. Consumers apply their own
 * time window so the same cached response can serve upcoming and recent views. */
export async function getTvmazeEpisodes(
  showId: number,
  signal?: AbortSignal,
): Promise<NormalizedTvmazeEpisode[]> {
  if (!Number.isSafeInteger(showId) || showId < 1) return [];
  const payload = await tvmazeRequest(`/shows/${showId}/episodes?specials=0`, signal);
  return findTvmazeEpisodes(payload);
}

/** Backwards-compatible future-only schedule helper. */
export async function getTvmazeUpcomingEpisodes(
  showId: number,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<NormalizedTvmazeEpisode[]> {
  const episodes = await getTvmazeEpisodes(showId, signal);
  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) return [];
  return episodes.filter((episode) => Date.parse(episode.airstamp) > nowTime);
}
