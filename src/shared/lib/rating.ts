/**
 * Ratings across Movena share TMDB's 0–10 scale. Provider and playlist values
 * are untrusted input; TMDB values come with the vote count that says how much
 * an average is worth.
 */

type MediaRatingSource = 'tmdb' | 'provider';

export interface MediaRating {
  /** 0–10, rounded to one decimal. */
  value: number;
  source: MediaRatingSource;
  /** TMDB only: how many votes the average stands on. */
  voteCount?: number | undefined;
}

/**
 * Where a TMDB lookup for one title stands. `off` covers both TMDB being
 * disabled and a title nobody asked TMDB about (catalogue entries outside the
 * checked head of a ranking).
 */
export type TmdbRatingLookup =
  | { status: 'off' | 'pending' | 'unmatched' | 'failed' }
  | {
      status: 'matched';
      voteAverage: number | null;
      voteCount: number;
      /** TMDB's genres for the title, in the catalogue's genre names. */
      genres?: readonly string[] | undefined;
    };

export const TMDB_RATING_OFF: TmdbRatingLookup = Object.freeze({ status: 'off' });

/**
 * TMDB averages below this many votes are one or two people's opinion: a
 * title that has just been added often sits at 10.0 on a single vote.
 */
export const MIN_TMDB_VOTES = 10;

/**
 * Provider panels copy TMDB's average once, when a title is imported, and
 * never refresh it. Scores above this are what is left of a title that had
 * one or two votes at the time (10.0 for a film the rest of the internet
 * rates 4.8), not real scores: nothing with a meaningful number of votes
 * averages that high on TMDB or IMDb.
 */
const MAX_PLAUSIBLE_PROVIDER_RATING = 9.5;

/** The rating a list must reach to count as top rated. */
export const TOP_RATED_MIN_RATING = 7;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratingNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  // Accepts "7.4", "7,4" and "7.4/10"; anything else is not a rating.
  const match = value.trim().match(/^(\d{1,3}(?:[.,]\d+)?)(?:\s*\/\s*10)?$/);
  return match ? Number(match[1]!.replace(',', '.')) : undefined;
}

/**
 * Reads an Xtream-style provider rating onto the 0–10 scale.
 *
 * `rating` is the ten-point value and `rating_5based` its halved companion. A
 * `rating` of 5 or less is not a five-point value by itself — 4.8 is a weak
 * film, not a 9.6 — so the companion is the only evidence of the scale: when
 * both carry the same number, `rating` was written on the five-point scale.
 */
export function parseProviderRating(
  rating: unknown,
  fivePointRating?: unknown,
): number | undefined {
  const tenPoint = ratingNumber(rating);
  const fivePoint = ratingNumber(fivePointRating);
  let value: number | undefined;
  if (tenPoint !== undefined && tenPoint > 0 && tenPoint <= 10) {
    const writtenOnFivePointScale =
      tenPoint <= 5 && fivePoint !== undefined && Math.abs(tenPoint - fivePoint) < 0.05;
    value = writtenOnFivePointScale ? tenPoint * 2 : tenPoint;
  } else if (fivePoint !== undefined && fivePoint > 0 && fivePoint <= 5) {
    value = fivePoint * 2;
  }
  if (value === undefined) return undefined;
  const rounded = roundToTenth(value);
  return rounded <= MAX_PLAUSIBLE_PROVIDER_RATING ? rounded : undefined;
}

/** A catalogue item's own rating, if it holds one on the 0–10 scale. */
export function providerRatingValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10
    ? roundToTenth(value)
    : undefined;
}

/** A TMDB average worth showing, or undefined when too few votes back it. */
function tmdbRating(voteAverage: number | null, voteCount: number): MediaRating | undefined {
  if (voteAverage === null || !Number.isFinite(voteAverage) || voteAverage <= 0) return undefined;
  if (voteAverage > 10 || voteCount < MIN_TMDB_VOTES) return undefined;
  return { value: roundToTenth(voteAverage), source: 'tmdb', voteCount };
}

/**
 * The rating to show for one title.
 *
 * Once TMDB has found the title its verdict stands, including "too few votes
 * to say": the provider's number is an old copy of that same thin TMDB data.
 * The provider only speaks when TMDB is off, does not know the title, or could
 * not be reached. While the lookup runs nothing is shown, so a provider score
 * never flashes up only to be replaced.
 */
export function resolveMediaRating(
  tmdb: TmdbRatingLookup,
  providerRating: number | undefined,
): MediaRating | null {
  if (tmdb.status === 'matched') return tmdbRating(tmdb.voteAverage, tmdb.voteCount) ?? null;
  if (tmdb.status === 'pending' || providerRating === undefined) return null;
  return { value: providerRating, source: 'provider' };
}

/**
 * Ranking order: the higher rating first, exactly as the numbers read. On a
 * tie the rating backed by more votes goes first; a provider rating counts as
 * none. Unrated titles go last.
 */
export function compareRatings(a: MediaRating | null, b: MediaRating | null): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  if (a.value !== b.value) return b.value - a.value;
  return (b.voteCount ?? 0) - (a.voteCount ?? 0);
}
