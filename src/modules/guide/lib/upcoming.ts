import type { UpcomingRelease } from '../data/useUpcomingReleases';
import type { MediaItem } from '@/modules/catalog/public/model/media';

export interface GroupedUpcomingRelease {
  favorite: MediaItem;
  airDate: string;
  exactAirTime: string | null;
  kind: 'movie' | 'episode';
  primaryRelease: UpcomingRelease;
  episodeCount: number;
  summarySubtitle: string;
  releases: UpcomingRelease[];
  /** Later dated groups for the same favorite, used by compact Discover cards. */
  followingReleaseCount?: number | undefined;
}

export type UpcomingKindFilter = 'all' | 'episode' | 'movie';

export function episodeScheduleKey(
  seasonNumber: number | string,
  episodeNumber: number | string,
): string {
  return `${Number(seasonNumber)}:${Number(episodeNumber)}`;
}

export function filterUpcomingByKind(
  groups: readonly GroupedUpcomingRelease[],
  kind: UpcomingKindFilter,
): GroupedUpcomingRelease[] {
  return kind === 'all' ? [...groups] : groups.filter((group) => group.kind === kind);
}

/** Group releases of the same show airing on the same date (e.g. binge season drops) */
export function groupUpcomingReleases(
  releases: readonly UpcomingRelease[],
): GroupedUpcomingRelease[] {
  if (!releases || releases.length === 0) return [];

  const groups = new Map<string, UpcomingRelease[]>();
  for (const release of releases) {
    const key = `${release.favorite.id}:${release.airDate}`;
    const items = groups.get(key) ?? [];
    items.push(release);
    groups.set(key, items);
  }

  const result: GroupedUpcomingRelease[] = [];
  for (const items of groups.values()) {
    const primary = items[0];
    if (!primary) continue;
    const episodeCount = items.length;

    if (episodeCount === 1 || primary.kind === 'movie') {
      let summarySubtitle = 'Movie premiere';
      if (primary.kind === 'episode') {
        const code =
          primary.seasonNumber !== null && primary.episodeNumber !== null
            ? `S${primary.seasonNumber} E${primary.episodeNumber}`
            : 'Next episode';
        summarySubtitle = `${code} · ${primary.title}`;
      }
      result.push({
        favorite: primary.favorite,
        airDate: primary.airDate,
        exactAirTime: primary.exactAirTime,
        kind: primary.kind,
        primaryRelease: primary,
        episodeCount: 1,
        summarySubtitle,
        releases: items,
      });
      continue;
    }

    const seasons = new Set(
      items.map((i) => i.seasonNumber).filter((s): s is number => s !== null),
    );
    const episodeNumbers = items.map((i) => i.episodeNumber).filter((e): e is number => e !== null);

    let episodeRangeText = `${episodeCount} episodes`;
    if (seasons.size === 1 && episodeNumbers.length === items.length) {
      const seasonNum = Array.from(seasons)[0];
      const minEp = Math.min(...episodeNumbers);
      const maxEp = Math.max(...episodeNumbers);
      episodeRangeText =
        minEp === maxEp ? `S${seasonNum} E${minEp}` : `S${seasonNum} E${minEp}–E${maxEp}`;
    }

    const summarySubtitle =
      episodeRangeText === `${episodeCount} episodes`
        ? episodeRangeText
        : `${episodeRangeText} · ${episodeCount} episodes`;

    result.push({
      favorite: primary.favorite,
      airDate: primary.airDate,
      exactAirTime: primary.exactAirTime,
      kind: 'episode',
      primaryRelease: primary,
      episodeCount,
      summarySubtitle,
      releases: items,
    });
  }

  return result;
}

/** Date-only values from TMDB are calendar days, not instants. Keep them in
 * local calendar time so a release is never shifted by a timezone. */
export function localCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function daysUntilCalendarDate(date: string, now = new Date()): number | null {
  const parsed = localCalendarDate(date);
  if (!parsed) return null;
  return Math.round((startOfDay(parsed) - startOfDay(now)) / 86_400_000);
}

export function countdownLabel(date: string, now = new Date()): string | null {
  const days = daysUntilCalendarDate(date, now);
  if (days === null) return null;
  if (days < 0) return 'Released';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export type ReleasePhase = 'released' | 'today' | 'upcoming';

/** Exact TV times become released at their actual instant. Date-only TMDB
 * releases remain "Today" for their entire local calendar day. */
export function releasePhase(
  release: Pick<GroupedUpcomingRelease, 'airDate' | 'exactAirTime'>,
  now = new Date(),
): ReleasePhase | null {
  if (release.exactAirTime) {
    const exact = exactTimestampDate(release.exactAirTime);
    if (exact && exact.getTime() <= now.getTime()) return 'released';
  }
  const days = daysUntilCalendarDate(release.airDate, now);
  if (days === null) return null;
  if (days < 0) return 'released';
  if (days === 0) return 'today';
  return 'upcoming';
}

/** Short, stable lifecycle copy for release cards and calendar events. */
export function releaseStatusLabel(
  release: Pick<GroupedUpcomingRelease, 'airDate' | 'exactAirTime' | 'kind'>,
  now = new Date(),
): string | null {
  const phase = releasePhase(release, now);
  const days = daysUntilCalendarDate(release.airDate, now);
  if (phase === null || days === null) return null;
  if (phase === 'released') {
    const verb = release.kind === 'episode' ? 'Aired' : 'Released';
    if (days === 0) return `${verb} today`;
    if (days === -1) return `${verb} yesterday`;
    return `${verb} ${Math.abs(days)} days ago`;
  }
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/**
 * TMDB episode schedules are date-only values. This is therefore a live
 * countdown to the beginning of that calendar date in the viewer's timezone,
 * never a claim about an exact provider upload time.
 */
export function releaseCountdown(date: string, now = new Date()): string | null {
  const target = localCalendarDate(date);
  if (!target) return null;
  return countdownToTimestamp(target.getTime(), now.getTime(), 'Today');
}

/**
 * TVmaze airstamps are timezone-aware ISO instants. A date-only TMDB value is
 * deliberately rejected here because it needs the local-calendar fallback
 * above, not UTC parsing.
 */
export function exactTimestampDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
    return null;
  if (!localCalendarDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a live countdown for a timezone-aware release instant. */
export function timestampCountdown(timestamp: string, now = new Date()): string | null {
  const target = exactTimestampDate(timestamp);
  if (!target) return null;
  return countdownToTimestamp(target.getTime(), now.getTime(), 'Released');
}

function countdownToTimestamp(targetTime: number, nowTime: number, elapsedLabel: string): string {
  let remaining = targetTime - nowTime;
  if (remaining <= 0) return elapsedLabel;
  const days = Math.floor(remaining / 86_400_000);
  remaining -= days * 86_400_000;
  const hours = Math.floor(remaining / 3_600_000);
  remaining -= hours * 3_600_000;
  const minutes = Math.floor(remaining / 60_000);
  remaining -= minutes * 60_000;
  const seconds = Math.floor(remaining / 1_000);
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  elapsed: boolean;
}

/** Numeric countdown pieces for presentation components. */
export function countdownParts(target: Date, now = new Date()): CountdownParts | null {
  const targetTime = target.getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(targetTime) || !Number.isFinite(nowTime)) return null;
  let remaining = targetTime - nowTime;
  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, elapsed: true };
  }
  const days = Math.floor(remaining / 86_400_000);
  remaining -= days * 86_400_000;
  const hours = Math.floor(remaining / 3_600_000);
  remaining -= hours * 3_600_000;
  const minutes = Math.floor(remaining / 60_000);
  remaining -= minutes * 60_000;
  const seconds = Math.floor(remaining / 1_000);
  return { days, hours, minutes, seconds, elapsed: false };
}

export interface HorizonGroups {
  recentlyReleased: GroupedUpcomingRelease[];
  today: GroupedUpcomingRelease[];
  thisWeek: GroupedUpcomingRelease[];
  nextWeek: GroupedUpcomingRelease[];
  later: GroupedUpcomingRelease[];
}

export function groupReleasesByHorizon(
  groups: readonly GroupedUpcomingRelease[],
  now = new Date(),
  historyDays = 7,
): HorizonGroups {
  const recentlyReleased: GroupedUpcomingRelease[] = [];
  const today: GroupedUpcomingRelease[] = [];
  const thisWeek: GroupedUpcomingRelease[] = [];
  const nextWeek: GroupedUpcomingRelease[] = [];
  const later: GroupedUpcomingRelease[] = [];

  for (const group of groups) {
    const days = daysUntilCalendarDate(group.airDate, now);
    const phase = releasePhase(group, now);
    if (phase === 'released') {
      if (days !== null && days >= -historyDays) recentlyReleased.push(group);
    } else if (phase === 'today') {
      today.push(group);
    } else if (days === null) {
      later.push(group);
    } else if (days <= 7) {
      thisWeek.push(group);
    } else if (days <= 14) {
      nextWeek.push(group);
    } else {
      later.push(group);
    }
  }

  recentlyReleased.sort((left, right) => {
    const leftTime = left.exactAirTime
      ? exactTimestampDate(left.exactAirTime)?.getTime()
      : localCalendarDate(left.airDate)?.getTime();
    const rightTime = right.exactAirTime
      ? exactTimestampDate(right.exactAirTime)?.getTime()
      : localCalendarDate(right.airDate)?.getTime();
    return (rightTime ?? 0) - (leftTime ?? 0);
  });

  return { recentlyReleased, today, thisWeek, nextWeek, later };
}

function releaseSortTime(group: GroupedUpcomingRelease): number {
  return (
    (group.exactAirTime ? exactTimestampDate(group.exactAirTime)?.getTime() : null) ??
    localCalendarDate(group.airDate)?.getTime() ??
    Number.POSITIVE_INFINITY
  );
}

/** Keep Discover focused: one nearest future date per favorite, with later
 * announcements summarized on that card instead of repeating the same show. */
export function nextReleasePerFavorite(
  groups: readonly GroupedUpcomingRelease[],
  now = new Date(),
): GroupedUpcomingRelease[] {
  const future = groups
    .filter((group) => releasePhase(group, now) !== 'released')
    .sort((left, right) => releaseSortTime(left) - releaseSortTime(right));
  const selected = new Map<string, GroupedUpcomingRelease>();

  for (const group of future) {
    const existing = selected.get(group.favorite.id);
    if (!existing) {
      selected.set(group.favorite.id, { ...group, followingReleaseCount: 0 });
    } else {
      existing.followingReleaseCount = (existing.followingReleaseCount ?? 0) + 1;
    }
  }

  return Array.from(selected.values());
}
