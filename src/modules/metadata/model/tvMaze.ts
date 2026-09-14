/**
 * Safe adapters for TVmaze's public show-search and episode responses.
 *
 * TVmaze is external input, so every exported normalizer accepts `unknown`
 * and drops malformed records instead of throwing.
 */

interface NormalizedTvmazeExternals {
  imdb: string | null;
  thetvdb: number | null;
  tvrage: number | null;
}

export interface NormalizedTvmazeShow {
  id: number;
  name: string;
  externals: NormalizedTvmazeExternals;
}

export interface NormalizedTvmazeEpisode {
  id: number | null;
  name: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** A timezone-aware ISO 8601 instant supplied by TVmaze. */
  airstamp: string;
}

const ISO_AIRSTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):?(\d{2}))$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function integer(value: unknown, minimum = 0): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;
}

function externalImdbId(value: unknown): string | null {
  const imdb = text(value);
  return imdb && /^tt\d{5,12}$/i.test(imdb) ? imdb : null;
}

/**
 * Accept only actual instants, not date-only values or timezone-free local
 * times. The calendar check prevents JavaScript's Date parser from silently
 * rolling invalid values such as 2026-02-30 into March.
 */
export function normalizeTvmazeAirstamp(value: unknown): string | null {
  const airstamp = text(value);
  if (!airstamp) return null;
  const match = ISO_AIRSTAMP.exec(airstamp);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  const offsetHour = match[8] === 'Z' ? 0 : Number(match[9]);
  const offsetMinute = match[8] === 'Z' ? 0 : Number(match[10]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  )
    return null;

  return Number.isFinite(Date.parse(airstamp)) ? airstamp : null;
}

function normalizeTvmazeShow(payload: unknown): NormalizedTvmazeShow | null {
  const source = record(payload);
  const id = integer(source?.id, 1);
  const name = text(source?.name);
  if (!source || id === null || !name) return null;

  const externals = record(source.externals);
  return {
    id,
    name,
    externals: {
      imdb: externalImdbId(externals?.imdb),
      thetvdb: integer(externals?.thetvdb, 1),
      tvrage: integer(externals?.tvrage, 1),
    },
  };
}

/** Normalize the array returned by GET /search/shows. */
export function normalizeTvmazeShowSearch(payload: unknown): NormalizedTvmazeShow[] {
  const shows: NormalizedTvmazeShow[] = [];
  const seen = new Set<number>();
  for (const entry of array(payload)) {
    const result = record(entry);
    const show = normalizeTvmazeShow(result?.show);
    if (!show || seen.has(show.id)) continue;
    seen.add(show.id);
    shows.push(show);
  }
  return shows;
}

function normalizeTvmazeEpisode(payload: unknown): NormalizedTvmazeEpisode | null {
  const source = record(payload);
  if (!source) return null;
  const airstamp = normalizeTvmazeAirstamp(source.airstamp);
  if (!airstamp) return null;
  return {
    id: integer(source.id, 1),
    name: text(source.name) ?? 'Upcoming episode',
    seasonNumber: integer(source.season, 0),
    episodeNumber: integer(source.number, 0),
    airstamp,
  };
}

function normalizeTvmazeEpisodes(payload: unknown): NormalizedTvmazeEpisode[] {
  const episodes: NormalizedTvmazeEpisode[] = [];
  const seen = new Set<string>();
  for (const entry of array(payload)) {
    const episode = normalizeTvmazeEpisode(entry);
    if (!episode) continue;
    const key = episode.id === null ? episode.airstamp : `id:${episode.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    episodes.push(episode);
  }
  return episodes;
}

/** Return every normalized episode ordered by its exact broadcast instant. */
export function findTvmazeEpisodes(payload: unknown): NormalizedTvmazeEpisode[] {
  return normalizeTvmazeEpisodes(payload).sort(
    (left, right) => Date.parse(left.airstamp) - Date.parse(right.airstamp),
  );
}

/** Return every exact episode instant after `now`, in chronological order. */
export function findFutureTvmazeEpisodes(
  payload: unknown,
  now: Date = new Date(),
): NormalizedTvmazeEpisode[] {
  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) return [];
  return findTvmazeEpisodes(payload).filter((episode) => Date.parse(episode.airstamp) > nowTime);
}

/** Return the chronologically first exact episode instant after `now`. */
export function findNextTvmazeEpisode(
  payload: unknown,
  now: Date = new Date(),
): NormalizedTvmazeEpisode | null {
  return findFutureTvmazeEpisodes(payload, now)[0] ?? null;
}
