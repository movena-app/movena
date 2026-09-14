import { describe, expect, it } from 'vitest';
import {
  countdownLabel,
  countdownParts,
  daysUntilCalendarDate,
  exactTimestampDate,
  filterUpcomingByKind,
  groupUpcomingReleases,
  groupReleasesByHorizon,
  localCalendarDate,
  nextReleasePerFavorite,
  releasePhase,
  releaseStatusLabel,
  releaseCountdown,
  timestampCountdown,
} from '@/modules/guide/lib/upcoming';

describe('upcoming release dates', () => {
  const today = new Date(2026, 7, 13, 19);

  it('keeps TMDB date-only values on their local calendar day', () => {
    expect(localCalendarDate('2026-08-14')?.getFullYear()).toBe(2026);
    expect(daysUntilCalendarDate('2026-08-13', today)).toBe(0);
    expect(daysUntilCalendarDate('2026-08-14', today)).toBe(1);
    expect(daysUntilCalendarDate('2026-08-20', today)).toBe(7);
  });

  it('rejects invalid dates and creates clear countdown labels', () => {
    expect(localCalendarDate('2026-02-30')).toBeNull();
    expect(daysUntilCalendarDate('not-a-date', today)).toBeNull();
    expect(countdownLabel('2026-08-13', today)).toBe('Today');
    expect(countdownLabel('2026-08-14', today)).toBe('Tomorrow');
    expect(countdownLabel('2026-08-20', today)).toBe('In 7 days');
    expect(countdownLabel('2026-08-12', today)).toBe('Released');
    expect(releaseCountdown('2026-08-14', new Date(2026, 7, 13, 12, 34, 56))).toBe(
      '0d 11h 25m 04s',
    );
    expect(releaseCountdown('2026-08-13', today)).toBe('Today');
  });

  it('counts down from timezone-aware airstamps as exact instants', () => {
    const now = new Date('2026-08-13T18:34:56.000Z');

    // Midnight in New York is 04:00 UTC; the viewer's timezone must not
    // affect this elapsed duration.
    expect(exactTimestampDate('2026-08-14T00:00:00-04:00')?.toISOString()).toBe(
      '2026-08-14T04:00:00.000Z',
    );
    expect(timestampCountdown('2026-08-14T00:00:00-04:00', now)).toBe('0d 09h 25m 04s');
    expect(timestampCountdown('2026-08-15T18:34:56Z', now)).toBe('2d 00h 00m 00s');
  });

  it('marks elapsed airstamps as released and keeps TMDB date-only values on their local fallback', () => {
    const now = new Date('2026-08-13T18:34:56.000Z');

    expect(timestampCountdown('2026-08-13T20:34:55+02:00', now)).toBe('Released');
    expect(timestampCountdown('2026-08-13', now)).toBeNull();
    expect(timestampCountdown('2026-08-14T00:00:00', now)).toBeNull();
    expect(exactTimestampDate('2026-02-30T00:00:00Z')).toBeNull();
    expect(exactTimestampDate('not-a-timestamp')).toBeNull();
    expect(releaseCountdown('2026-08-14', new Date(2026, 7, 13, 23, 59, 59))).toBe(
      '0d 00h 00m 01s',
    );
  });

  it('provides stable numeric parts for a segmented countdown', () => {
    expect(
      countdownParts(new Date('2026-08-15T20:35:01Z'), new Date('2026-08-13T18:34:56Z')),
    ).toEqual({ days: 2, hours: 2, minutes: 0, seconds: 5, elapsed: false });
    expect(
      countdownParts(new Date('2026-08-13T18:34:55Z'), new Date('2026-08-13T18:34:56Z')),
    ).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, elapsed: true });
    expect(countdownParts(new Date(Number.NaN))).toBeNull();
  });

  it('groups multiple episodes for the same show on the same date cleanly', () => {
    const favorite = { id: 'show-1', title: 'Outer Banks', posterUrl: '', type: 'series' as const };
    const releases = [
      {
        favorite,
        tmdbId: 1,
        airDate: '2026-10-20',
        kind: 'episode' as const,
        title: 'Ep 1',
        seasonNumber: 4,
        episodeNumber: 1,
        artworkUrl: null,
        exactAirTime: '2026-10-20T14:00:00Z',
        timeSource: 'tvmaze' as const,
      },
      {
        favorite,
        tmdbId: 1,
        airDate: '2026-10-20',
        kind: 'episode' as const,
        title: 'Ep 2',
        seasonNumber: 4,
        episodeNumber: 2,
        artworkUrl: null,
        exactAirTime: '2026-10-20T14:00:00Z',
        timeSource: 'tvmaze' as const,
      },
      {
        favorite,
        tmdbId: 1,
        airDate: '2026-10-20',
        kind: 'episode' as const,
        title: 'Ep 10',
        seasonNumber: 4,
        episodeNumber: 10,
        artworkUrl: null,
        exactAirTime: '2026-10-20T14:00:00Z',
        timeSource: 'tvmaze' as const,
      },
    ];

    const empty = groupUpcomingReleases([]);
    expect(empty).toEqual([]);

    const grouped = groupUpcomingReleases(releases);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.episodeCount).toBe(3);
    expect(grouped[0]!.summarySubtitle).toBe('S4 E1–E10 · 3 episodes');
  });

  it('does not repeat the episode count when episode numbers are unavailable', () => {
    const favorite = {
      id: 'show-undated',
      title: 'Mystery Drop',
      posterUrl: '',
      type: 'series' as const,
    };
    const grouped = groupUpcomingReleases([
      {
        favorite,
        tmdbId: 1,
        airDate: '2026-10-20',
        kind: 'episode' as const,
        title: 'One',
        seasonNumber: null,
        episodeNumber: null,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb' as const,
      },
      {
        favorite,
        tmdbId: 1,
        airDate: '2026-10-20',
        kind: 'episode' as const,
        title: 'Two',
        seasonNumber: null,
        episodeNumber: null,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb' as const,
      },
    ]);
    expect(grouped[0]!.summarySubtitle).toBe('2 episodes');
  });

  it('groups releases into chronological horizons', () => {
    const favorite = { id: 'show-1', title: 'Outer Banks', posterUrl: '', type: 'series' as const };
    const groups = [
      {
        favorite,
        airDate: '2026-08-15',
        exactAirTime: null,
        kind: 'episode' as const,
        primaryRelease: {
          favorite,
          tmdbId: 1,
          airDate: '2026-08-15',
          kind: 'episode' as const,
          title: 'Ep 1',
          seasonNumber: 1,
          episodeNumber: 1,
          artworkUrl: null,
          exactAirTime: null,
          timeSource: 'tmdb' as const,
        },
        episodeCount: 1,
        summarySubtitle: 'S1 E1',
        releases: [],
      },
      {
        favorite,
        airDate: '2026-08-25',
        exactAirTime: null,
        kind: 'episode' as const,
        primaryRelease: {
          favorite,
          tmdbId: 1,
          airDate: '2026-08-25',
          kind: 'episode' as const,
          title: 'Ep 2',
          seasonNumber: 1,
          episodeNumber: 2,
          artworkUrl: null,
          exactAirTime: null,
          timeSource: 'tmdb' as const,
        },
        episodeCount: 1,
        summarySubtitle: 'S1 E2',
        releases: [],
      },
      {
        favorite,
        airDate: '2026-09-10',
        exactAirTime: null,
        kind: 'episode' as const,
        primaryRelease: {
          favorite,
          tmdbId: 1,
          airDate: '2026-09-10',
          kind: 'episode' as const,
          title: 'Ep 3',
          seasonNumber: 1,
          episodeNumber: 3,
          artworkUrl: null,
          exactAirTime: null,
          timeSource: 'tmdb' as const,
        },
        episodeCount: 1,
        summarySubtitle: 'S1 E3',
        releases: [],
      },
    ];

    const horizons = groupReleasesByHorizon(groups, today);
    expect(horizons.thisWeek).toHaveLength(1);
    expect(horizons.nextWeek).toHaveLength(1);
    expect(horizons.later).toHaveLength(1);
  });

  it('moves elapsed releases into a bounded recent section instead of dropping them', () => {
    const favorite = { id: 'show-1', title: 'Outer Banks', posterUrl: '', type: 'series' as const };
    const release = (airDate: string, exactAirTime: string | null = null) => ({
      favorite,
      airDate,
      exactAirTime,
      kind: 'episode' as const,
      primaryRelease: {
        favorite,
        tmdbId: 1,
        airDate,
        kind: 'episode' as const,
        title: 'Episode',
        seasonNumber: 1,
        episodeNumber: 1,
        artworkUrl: null,
        exactAirTime,
        timeSource: 'tmdb' as const,
      },
      episodeCount: 1,
      summarySubtitle: 'S1 E1',
      releases: [],
    });
    const recent = release('2026-08-12');
    const expired = release('2026-08-05');
    const exactElapsedToday = release('2026-08-13', '2026-08-13T18:00:00Z');
    const laterToday = release('2026-08-13', '2026-08-13T22:00:00Z');

    const horizons = groupReleasesByHorizon(
      [expired, recent, exactElapsedToday, laterToday],
      new Date('2026-08-13T20:00:00Z'),
      7,
    );

    expect(horizons.recentlyReleased).toEqual([exactElapsedToday, recent]);
    expect(horizons.today).toEqual([laterToday]);
    expect(releasePhase(exactElapsedToday, new Date('2026-08-13T20:00:00Z'))).toBe('released');
    expect(releaseStatusLabel(recent, new Date(2026, 7, 13, 12))).toBe('Aired yesterday');
  });

  it('filters series by the episode release kind used by grouped data', () => {
    const favorite = { id: 'show-1', title: 'Outer Banks', posterUrl: '', type: 'series' as const };
    const movie = { id: 'movie-1', title: 'Film', posterUrl: '', type: 'vod' as const };
    const groups = groupUpcomingReleases([
      {
        favorite,
        tmdbId: 1,
        airDate: '2026-08-20',
        kind: 'episode',
        title: 'Episode',
        seasonNumber: 1,
        episodeNumber: 1,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
      {
        favorite: movie,
        tmdbId: 2,
        airDate: '2026-08-21',
        kind: 'movie',
        title: 'Film',
        seasonNumber: null,
        episodeNumber: null,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
    ]);

    expect(filterUpcomingByKind(groups, 'episode').map((group) => group.favorite.id)).toEqual([
      'show-1',
    ]);
    expect(filterUpcomingByKind(groups, 'movie').map((group) => group.favorite.id)).toEqual([
      'movie-1',
    ]);
  });

  it('keeps one nearest future release per favorite and summarizes later dates', () => {
    const show = { id: 'show-1', title: 'Show', posterUrl: '', type: 'series' as const };
    const other = { id: 'show-2', title: 'Other', posterUrl: '', type: 'series' as const };
    const grouped = groupUpcomingReleases([
      {
        favorite: show,
        tmdbId: 1,
        airDate: '2026-08-20',
        kind: 'episode',
        title: 'Next',
        seasonNumber: 2,
        episodeNumber: 3,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
      {
        favorite: show,
        tmdbId: 1,
        airDate: '2026-08-27',
        kind: 'episode',
        title: 'Later',
        seasonNumber: 2,
        episodeNumber: 4,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
      {
        favorite: show,
        tmdbId: 1,
        airDate: '2026-08-12',
        kind: 'episode',
        title: 'Past',
        seasonNumber: 2,
        episodeNumber: 2,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
      {
        favorite: other,
        tmdbId: 2,
        airDate: '2026-08-21',
        kind: 'episode',
        title: 'Other next',
        seasonNumber: 1,
        episodeNumber: 1,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
    ]);

    expect(
      nextReleasePerFavorite(grouped, today).map((group) => ({
        id: group.favorite.id,
        airDate: group.airDate,
        following: group.followingReleaseCount,
      })),
    ).toEqual([
      { id: 'show-1', airDate: '2026-08-20', following: 1 },
      { id: 'show-2', airDate: '2026-08-21', following: 0 },
    ]);
  });
});
