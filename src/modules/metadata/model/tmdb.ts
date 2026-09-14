/**
 * Pure adapters for the public shapes returned by TMDB.
 *
 * TMDB responses are external input. These functions intentionally accept
 * unknown values and never throw for malformed or partial payloads.
 */

type TmdbMediaType = 'movie' | 'tv' | 'person';
export type TmdbImageSize = 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

interface NormalizedTmdbGenre {
  id: number | null;
  name: string;
}

interface NormalizedTmdbCredit {
  id: number | null;
  creditId: string | null;
  name: string;
  profileUrl: string | null;
  department: string | null;
  character: string | null;
  job: string | null;
  order: number | null;
  roles: string[];
  jobs: string[];
}

export interface NormalizedTmdbCredits {
  cast: NormalizedTmdbCredit[];
  crew: NormalizedTmdbCredit[];
}

interface NormalizedTmdbVideo {
  id: string | null;
  name: string;
  site: 'YouTube' | 'Vimeo';
  type: string | null;
  official: boolean;
  publishedAt: string | null;
  url: string;
}

export interface NormalizedTmdbMovie {
  mediaType: 'movie';
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number | null;
  genres: NormalizedTmdbGenre[];
  credits: NormalizedTmdbCredits;
  videos: NormalizedTmdbVideo[];
}

interface NormalizedTmdbSeason {
  id: number | null;
  name: string;
  seasonNumber: number;
  episodeCount: number | null;
  airDate: string | null;
  posterUrl: string | null;
  overview: string;
  voteAverage: number | null;
}

export interface NormalizedTmdbTv {
  mediaType: 'tv';
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number | null;
  genres: NormalizedTmdbGenre[];
  seasons: NormalizedTmdbSeason[];
  nextEpisodeToAir: NormalizedTmdbEpisode | null;
  lastEpisodeToAir: NormalizedTmdbEpisode | null;
  credits: NormalizedTmdbCredits;
  videos: NormalizedTmdbVideo[];
}

/** A scheduled episode from a TV details response. Times are intentionally
 * omitted: TMDB normally supplies an air _date_, not a reliable local time. */
interface NormalizedTmdbEpisode {
  id: number | null;
  name: string;
  airDate: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  overview: string;
  stillUrl: string | null;
}

export interface NormalizedTmdbPerson {
  mediaType: 'person';
  id: number;
  name: string;
  biography: string;
  profileUrl: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string | null;
  gender: number | null;
  popularity: number | null;
  credits: NormalizedTmdbCredits;
  knownFor: NormalizedTmdbSearchResult[];
}

interface NormalizedTmdbSearchResult {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  profileUrl: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  voteAverage: number | null;
  knownForDepartment: string | null;
  knownFor: NormalizedTmdbSearchResult[];
}

export interface NormalizedTmdbSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: NormalizedTmdbSearchResult[];
}

const IMAGE_HOST = 'image.tmdb.org';
const IMAGE_PATH_PREFIX = '/t/p/';
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_IMAGE_PATH = /^\/(?!\/)(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-])+$/;

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

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function integer(value: unknown, minimum = 0): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= minimum ? number : null;
}

function boundedNumber(value: unknown, minimum: number, maximum?: number): number | null {
  const number = finiteNumber(value);
  if (number === null || number < minimum || (maximum !== undefined && number > maximum))
    return null;
  return number;
}

function normalizeDate(value: unknown): string | null {
  const date = text(value);
  if (!date || !VALID_DATE.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

function yearFromDate(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return year >= 1800 && year <= 2200 ? year : null;
}

function id(value: unknown): number | null {
  return integer(value, 1);
}

function validImagePath(pathname: string): boolean {
  return VALID_IMAGE_PATH.test(pathname) && !pathname.split('/').includes('..');
}

/** Convert a TMDB path or an already absolute TMDB image URL to a safe URL. */
export function sanitizeTmdbImageUrl(value: unknown, size: TmdbImageSize = 'w500'): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input || /[\u0000-\u001f\u007f]/.test(input)) return null;

  let imagePath: string | null = null;
  if (input.startsWith('/') && !input.startsWith('//')) {
    imagePath = input.split(/[?#]/, 1)[0] ?? null;
  } else {
    try {
      const parsed = new URL(input);
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== IMAGE_HOST) return null;
      const marker = parsed.pathname.indexOf(IMAGE_PATH_PREFIX);
      if (marker === -1) return null;
      const path = parsed.pathname.slice(marker + IMAGE_PATH_PREFIX.length);
      const separator = path.indexOf('/');
      imagePath = separator === -1 ? null : path.slice(separator);
    } catch {
      return null;
    }
  }

  if (!imagePath || !validImagePath(imagePath)) return null;
  return `https://${IMAGE_HOST}${IMAGE_PATH_PREFIX}${size}${imagePath}`;
}

function videoHost(site: string, url: URL): 'YouTube' | 'Vimeo' | null {
  const host = url.hostname.toLowerCase();
  if (site.toLowerCase() === 'youtube' && YOUTUBE_HOSTS.has(host)) return 'YouTube';
  if (site.toLowerCase() === 'vimeo' && VIMEO_HOSTS.has(host)) return 'Vimeo';
  return null;
}

/** Allow only HTTPS video URLs from the providers TMDB exposes. */
export function sanitizeTmdbVideoUrl(value: unknown, site: unknown): string | null {
  if (typeof value !== 'string' || typeof site !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return null;
    const provider = videoHost(site, parsed);
    if (!provider) return null;

    if (provider === 'YouTube') {
      const videoId =
        parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
      if (!videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return null;
      return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }

    const videoId = parsed.pathname.split('/').filter(Boolean).pop();
    return videoId && /^\d+$/.test(videoId) ? `https://vimeo.com/${videoId}` : null;
  } catch {
    return null;
  }
}

function videoUrl(site: unknown, key: unknown): string | null {
  if (typeof site !== 'string' || typeof key !== 'string') return null;
  const cleanKey = key.trim();
  if (!cleanKey) return null;
  if (site.toLowerCase() === 'youtube' && /^[A-Za-z0-9_-]{6,}$/.test(cleanKey)) {
    return sanitizeTmdbVideoUrl(`https://www.youtube.com/watch?v=${cleanKey}`, site);
  }
  if (site.toLowerCase() === 'vimeo' && /^\d+$/.test(cleanKey)) {
    return sanitizeTmdbVideoUrl(`https://vimeo.com/${cleanKey}`, site);
  }
  return sanitizeTmdbVideoUrl(cleanKey, site);
}

function normalizeGenres(value: unknown): NormalizedTmdbGenre[] {
  const genres: NormalizedTmdbGenre[] = [];
  const seen = new Set<string>();
  for (const entry of array(value)) {
    const genre = record(entry);
    const name = text(genre?.name);
    if (!name) continue;
    const genreId = id(genre?.id);
    const key = genreId === null ? `name:${name.toLowerCase()}` : `id:${genreId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    genres.push({ id: genreId, name });
  }
  return genres;
}

function uniqueTexts(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = text(value);
    const key = normalized?.toLocaleLowerCase();
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function creditRoleValues(value: unknown, field: 'character' | 'job'): string[] {
  return array(value)
    .flatMap((entry) => {
      const item = record(entry);
      return [text(item?.[field]) ?? text(item?.name)];
    })
    .filter((entry): entry is string => entry !== null);
}

function normalizeCredit(value: unknown, kind: 'cast' | 'crew'): NormalizedTmdbCredit | null {
  const source = record(value);
  const name = text(source?.name);
  if (!name) return null;

  const characters =
    kind === 'cast'
      ? [text(source?.character), ...creditRoleValues(source?.roles, 'character')]
      : [];
  const jobs = kind === 'crew' ? [text(source?.job), ...creditRoleValues(source?.jobs, 'job')] : [];
  const roleList = uniqueTexts(characters);
  const jobList = uniqueTexts(jobs);
  return {
    id: id(source?.id),
    creditId: text(source?.credit_id),
    name,
    profileUrl: sanitizeTmdbImageUrl(source?.profile_path, 'w185'),
    department: text(source?.known_for_department) ?? text(source?.department),
    character: roleList[0] ?? null,
    job: jobList[0] ?? null,
    order: integer(source?.order, 0),
    roles: roleList,
    jobs: jobList,
  };
}

function mergeCredit(
  left: NormalizedTmdbCredit,
  right: NormalizedTmdbCredit,
): NormalizedTmdbCredit {
  return {
    ...left,
    creditId: left.creditId ?? right.creditId,
    profileUrl: left.profileUrl ?? right.profileUrl,
    department: left.department ?? right.department,
    character: left.character ?? right.character,
    job: left.job ?? right.job,
    order: left.order ?? right.order,
    roles: uniqueTexts([...left.roles, ...right.roles]),
    jobs: uniqueTexts([...left.jobs, ...right.jobs]),
  };
}

function normalizeCreditList(value: unknown, kind: 'cast' | 'crew'): NormalizedTmdbCredit[] {
  const result: NormalizedTmdbCredit[] = [];
  const indexes = new Map<string, number>();
  for (const entry of array(value)) {
    const credit = normalizeCredit(entry, kind);
    if (!credit) continue;
    const key =
      credit.id === null
        ? `${credit.name.toLowerCase()}|${(credit.character ?? credit.job ?? '').toLowerCase()}`
        : `id:${credit.id}`;
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, result.length);
      result.push(credit);
    } else {
      result[existingIndex] = mergeCredit(result[existingIndex]!, credit);
    }
  }
  return result;
}

/** Normalize cast and crew from either details.credits or aggregate_credits. */
export function normalizeTmdbCredits(value: unknown): NormalizedTmdbCredits {
  const source = record(value) ?? {};
  return {
    cast: normalizeCreditList(source.cast, 'cast'),
    crew: normalizeCreditList(source.crew, 'crew'),
  };
}

function normalizeVideos(value: unknown): NormalizedTmdbVideo[] {
  const result: NormalizedTmdbVideo[] = [];
  const seen = new Set<string>();
  for (const entry of array(value)) {
    const source = record(entry);
    const site = text(source?.site);
    const url = videoUrl(site, source?.key) ?? sanitizeTmdbVideoUrl(source?.url, site);
    if (!url || (site?.toLowerCase() !== 'youtube' && site?.toLowerCase() !== 'vimeo')) continue;
    const key = `${site.toLowerCase()}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: text(source?.id),
      name: text(source?.name) ?? 'Video',
      site: site.toLowerCase() === 'youtube' ? 'YouTube' : 'Vimeo',
      type: text(source?.type),
      official: source?.official === true,
      publishedAt: normalizeDate(source?.published_at),
      url,
    });
  }
  return result;
}

function normalizedBase(source: Record<string, unknown>): {
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number | null;
  genres: NormalizedTmdbGenre[];
  credits: NormalizedTmdbCredits;
  videos: NormalizedTmdbVideo[];
} {
  return {
    overview: text(source.overview) ?? '',
    posterUrl: sanitizeTmdbImageUrl(source.poster_path, 'w500'),
    backdropUrl: sanitizeTmdbImageUrl(source.backdrop_path, 'w1280'),
    voteAverage: boundedNumber(source.vote_average, 0, 10),
    voteCount: integer(source.vote_count, 0) ?? 0,
    popularity: boundedNumber(source.popularity, 0),
    genres: normalizeGenres(source.genres),
    credits: normalizeTmdbCredits(source.credits ?? source.aggregate_credits),
    videos: normalizeVideos(record(source.videos)?.results),
  };
}

export function normalizeTmdbMovie(payload: unknown): NormalizedTmdbMovie | null {
  const source = record(payload);
  const movieId = id(source?.id);
  const title = text(source?.title);
  if (!source || movieId === null || !title) return null;
  const base = normalizedBase(source);
  const releaseDate = normalizeDate(source.release_date);
  return {
    mediaType: 'movie',
    id: movieId,
    title,
    originalTitle: text(source.original_title),
    ...base,
    releaseDate,
    releaseYear: yearFromDate(releaseDate),
    runtimeMinutes: integer(source.runtime, 0),
  };
}

function normalizeSeasons(value: unknown): NormalizedTmdbSeason[] {
  const result: NormalizedTmdbSeason[] = [];
  const seen = new Set<number>();
  for (const entry of array(value)) {
    const source = record(entry);
    const seasonNumber = integer(source?.season_number, 0);
    if (seasonNumber === null || seen.has(seasonNumber)) continue;
    seen.add(seasonNumber);
    const airDate = normalizeDate(source?.air_date);
    result.push({
      id: id(source?.id),
      name: text(source?.name) ?? `Season ${seasonNumber}`,
      seasonNumber,
      episodeCount: integer(source?.episode_count, 0),
      airDate,
      posterUrl: sanitizeTmdbImageUrl(source?.poster_path, 'w342'),
      overview: text(source?.overview) ?? '',
      voteAverage: boundedNumber(source?.vote_average, 0, 10),
    });
  }
  return result;
}

function normalizeEpisode(value: unknown): NormalizedTmdbEpisode | null {
  const source = record(value);
  if (!source) return null;
  const episodeId = id(source.id);
  const airDate = normalizeDate(source.air_date);
  // An episode without either a stable id or an air date is not useful for a
  // release calendar and is usually a partial placeholder response.
  if (episodeId === null && !airDate) return null;
  return {
    id: episodeId,
    name: text(source.name) ?? 'Upcoming episode',
    airDate,
    seasonNumber: integer(source.season_number, 0),
    episodeNumber: integer(source.episode_number, 0),
    overview: text(source.overview) ?? '',
    stillUrl: sanitizeTmdbImageUrl(source.still_path, 'w780'),
  };
}

export function normalizeTmdbTv(payload: unknown): NormalizedTmdbTv | null {
  const source = record(payload);
  const tvId = id(source?.id);
  const title = text(source?.name);
  if (!source || tvId === null || !title) return null;
  const base = normalizedBase(source);
  const firstAirDate = normalizeDate(source.first_air_date);
  return {
    mediaType: 'tv',
    id: tvId,
    title,
    originalTitle: text(source.original_name),
    ...base,
    firstAirDate,
    lastAirDate: normalizeDate(source.last_air_date),
    releaseYear: yearFromDate(firstAirDate),
    runtimeMinutes: integer(array(source.episode_run_time)[0], 0),
    numberOfSeasons: integer(source.number_of_seasons, 0),
    numberOfEpisodes: integer(source.number_of_episodes, 0),
    seasons: normalizeSeasons(source.seasons),
    nextEpisodeToAir: normalizeEpisode(source.next_episode_to_air),
    lastEpisodeToAir: normalizeEpisode(source.last_episode_to_air),
  };
}

function searchMediaType(source: Record<string, unknown>): TmdbMediaType | null {
  if (
    source.media_type === 'movie' ||
    source.media_type === 'tv' ||
    source.media_type === 'person'
  ) {
    return source.media_type;
  }
  if (source.title !== undefined) return 'movie';
  if (source.name !== undefined && source.profile_path !== undefined) return 'person';
  if (source.name !== undefined) return 'tv';
  return null;
}

function normalizeSearchResult(payload: unknown): NormalizedTmdbSearchResult | null {
  const source = record(payload);
  if (!source) return null;
  const mediaType = searchMediaType(source);
  const resultId = id(source.id);
  if (!mediaType || resultId === null) return null;

  const title = text(mediaType === 'movie' ? source.title : source.name);
  if (!title) return null;
  const releaseDate = normalizeDate(
    mediaType === 'movie' ? source.release_date : source.first_air_date,
  );
  const knownFor =
    mediaType === 'person'
      ? array(source.known_for).flatMap((entry) => {
          const normalized = normalizeSearchResult(entry);
          return normalized ? [normalized] : [];
        })
      : [];
  return {
    mediaType,
    id: resultId,
    title,
    originalTitle: text(mediaType === 'movie' ? source.original_title : source.original_name),
    overview: text(source.overview) ?? '',
    posterUrl: sanitizeTmdbImageUrl(source.poster_path, 'w500'),
    backdropUrl: sanitizeTmdbImageUrl(source.backdrop_path, 'w780'),
    profileUrl: sanitizeTmdbImageUrl(source.profile_path, 'w185'),
    releaseDate,
    releaseYear: yearFromDate(releaseDate),
    voteAverage: boundedNumber(source.vote_average, 0, 10),
    knownForDepartment: text(source.known_for_department),
    knownFor,
  };
}

export function normalizeTmdbSearch(payload: unknown): NormalizedTmdbSearchResponse {
  const source = record(payload);
  const results = array(source?.results).flatMap((entry) => {
    const normalized = normalizeSearchResult(entry);
    return normalized ? [normalized] : [];
  });
  return {
    page: integer(source?.page, 1) ?? 1,
    totalPages: integer(source?.total_pages, 0) ?? 0,
    totalResults: integer(source?.total_results, 0) ?? results.length,
    results,
  };
}

export function normalizeTmdbPerson(payload: unknown): NormalizedTmdbPerson | null {
  const source = record(payload);
  const personId = id(source?.id);
  const name = text(source?.name);
  if (!source || personId === null || !name) return null;
  return {
    mediaType: 'person',
    id: personId,
    name,
    biography: text(source.biography) ?? '',
    profileUrl: sanitizeTmdbImageUrl(source.profile_path, 'w500'),
    birthday: normalizeDate(source.birthday),
    deathday: normalizeDate(source.deathday),
    placeOfBirth: text(source.place_of_birth),
    knownForDepartment: text(source.known_for_department),
    gender: integer(source.gender, 0),
    popularity: boundedNumber(source.popularity, 0),
    credits: normalizeTmdbCredits(source.combined_credits ?? source.credits),
    knownFor: array(source.known_for).flatMap((entry) => {
      const normalized = normalizeSearchResult(entry);
      return normalized ? [normalized] : [];
    }),
  };
}

export interface NormalizedTmdbExternalIds {
  imdbId: string | null;
}

const VALID_IMDB_ID = /^tt\d{7,8}$/;

/** Extract external identifiers from a TMDB `/tv/{id}/external_ids` response. */
export function normalizeTmdbExternalIds(payload: unknown): NormalizedTmdbExternalIds {
  const source = record(payload);
  const raw = text(source?.imdb_id);
  return { imdbId: raw && VALID_IMDB_ID.test(raw) ? raw : null };
}

// Explicit aliases make the payload-oriented API convenient for callers.
