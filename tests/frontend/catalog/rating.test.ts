import { describe, expect, it } from 'vitest';
import {
  compareRatings,
  MIN_TMDB_VOTES,
  parseProviderRating,
  providerRatingValue,
  resolveMediaRating,
  TMDB_RATING_OFF,
} from '@/shared/lib/rating';

describe('parseProviderRating', () => {
  it('reads the ten-point rating as is, including weak films', () => {
    expect(parseProviderRating('7.4', 3.7)).toBe(7.4);
    // A 4.8 is a weak film, not a 9.6 on a five-point scale.
    expect(parseProviderRating('4.8', 2.4)).toBe(4.8);
    expect(parseProviderRating('4.8')).toBe(4.8);
    expect(parseProviderRating(6.25)).toBe(6.3);
  });

  it('accepts decimal commas and an explicit out-of-ten suffix', () => {
    expect(parseProviderRating('7,4')).toBe(7.4);
    expect(parseProviderRating(' 7.4/10 ')).toBe(7.4);
  });

  it('doubles a rating only when its five-point companion shows the scale', () => {
    expect(parseProviderRating('4.5', 4.5)).toBe(9);
    expect(parseProviderRating('3.2', '3.2')).toBe(6.4);
    expect(parseProviderRating('', 3.7)).toBe(7.4);
    expect(parseProviderRating(undefined, '3.7')).toBe(7.4);
  });

  it('drops scores no title with real votes reaches', () => {
    expect(parseProviderRating('10', 5)).toBeUndefined();
    expect(parseProviderRating('9.6')).toBeUndefined();
    expect(parseProviderRating('5', 5)).toBeUndefined();
    expect(parseProviderRating('9.5', 4.75)).toBe(9.5);
  });

  it('treats empty, zero, negative and malformed values as unrated', () => {
    for (const value of ['', '0', '0.0', '-3', 'N/A', 'abc', '74', '74%', null, undefined, NaN]) {
      expect(parseProviderRating(value, value), String(value)).toBeUndefined();
    }
    expect(parseProviderRating(Infinity)).toBeUndefined();
    expect(parseProviderRating('0', 0)).toBeUndefined();
  });
});

describe('providerRatingValue', () => {
  it('keeps catalogue ratings on the ten-point scale only', () => {
    expect(providerRatingValue(8.24)).toBe(8.2);
    expect(providerRatingValue(10)).toBe(10);
    expect(providerRatingValue(0)).toBeUndefined();
    expect(providerRatingValue(10.5)).toBeUndefined();
    expect(providerRatingValue('8')).toBeUndefined();
    expect(providerRatingValue(undefined)).toBeUndefined();
  });
});

describe('resolveMediaRating', () => {
  it("shows TMDB's average once enough votes back it", () => {
    expect(
      resolveMediaRating({ status: 'matched', voteAverage: 4.836, voteCount: 212 }, 10),
    ).toEqual({ value: 4.8, source: 'tmdb', voteCount: 212 });
  });

  it('shows nothing, not the provider copy, when TMDB has too few votes', () => {
    const thin = { status: 'matched' as const, voteAverage: 10, voteCount: MIN_TMDB_VOTES - 1 };
    expect(resolveMediaRating(thin, 9.4)).toBeNull();
    expect(resolveMediaRating({ status: 'matched', voteAverage: 0, voteCount: 500 }, 7)).toBeNull();
    expect(
      resolveMediaRating({ status: 'matched', voteAverage: null, voteCount: 500 }, 7),
    ).toBeNull();
  });

  it('holds back while TMDB is still answering', () => {
    expect(resolveMediaRating({ status: 'pending' }, 7.1)).toBeNull();
  });

  it('falls back to the provider rating, marked as such, when TMDB cannot speak', () => {
    for (const status of ['off', 'unmatched', 'failed'] as const) {
      expect(resolveMediaRating({ status }, 7.1)).toEqual({ value: 7.1, source: 'provider' });
    }
    expect(resolveMediaRating(TMDB_RATING_OFF, undefined)).toBeNull();
  });
});

describe('compareRatings', () => {
  const provider = (value: number) => ({ value, source: 'provider' as const });
  const tmdb = (value: number, voteCount: number) => ({
    value,
    source: 'tmdb' as const,
    voteCount,
  });
  const order = (ratings: Array<ReturnType<typeof provider> | ReturnType<typeof tmdb> | null>) =>
    [...ratings].sort(compareRatings);

  it('puts the highest rating first, as the numbers read', () => {
    expect(order([tmdb(8.5, 25_000), provider(7.2), tmdb(9.1, 40), provider(9.4)])).toEqual([
      provider(9.4),
      tmdb(9.1, 40),
      tmdb(8.5, 25_000),
      provider(7.2),
    ]);
  });

  it('breaks ties by votes and puts unrated titles last', () => {
    expect(order([null, provider(8), tmdb(8, 12), tmdb(8, 3_000), null])).toEqual([
      tmdb(8, 3_000),
      tmdb(8, 12),
      provider(8),
      null,
      null,
    ]);
  });
});
