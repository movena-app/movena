import { useMemo, useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Film } from 'lucide-react';
import type { MediaItem, MediaOpenContext } from '@/modules/catalog/public/model/media';
import { Button } from '@/shared/ui/Button';
import { useUpcomingReleases, type UpcomingRelease } from '../data/useUpcomingReleases';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import {
  countdownParts,
  exactTimestampDate,
  groupReleasesByHorizon,
  groupUpcomingReleases,
  localCalendarDate,
  nextReleasePerFavorite,
  releasePhase,
  releaseStatusLabel,
  type CountdownParts,
  type GroupedUpcomingRelease,
} from '../lib/upcoming';
import { parseMediaDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './UpcomingReleaseCard.module.css';
import { getErrorMessage } from '@/shared/lib/error';

interface UpcomingReleaseCardProps {
  onOpen: (item: MediaItem, context?: MediaOpenContext) => void;
  onViewAll?: (() => void) | undefined;
  showEmpty?: boolean | undefined;
  variant?: 'discover' | 'schedule' | undefined;
  limit?: number | undefined;
  releases?: readonly GroupedUpcomingRelease[] | undefined;
  /** A page-level clock avoids one timer and render per schedule section. */
  now?: Date | undefined;
}

function releaseTitle(release: UpcomingRelease): string {
  return (
    parseMediaDisplayTitle(release.favorite.title, release.favorite.year)?.cleanTitle ??
    release.favorite.title
  );
}

function formatCountdownInline(remaining: CountdownParts): string {
  if (remaining.elapsed) return '';
  if (remaining.days > 0) {
    return `${remaining.days}d ${String(remaining.hours).padStart(2, '0')}h`;
  }
  if (remaining.hours > 0) {
    return `${remaining.hours}h ${String(remaining.minutes).padStart(2, '0')}m ${String(remaining.seconds).padStart(2, '0')}s`;
  }
  return `${remaining.minutes}m ${String(remaining.seconds).padStart(2, '0')}s`;
}

interface CompactReleaseProps {
  release: GroupedUpcomingRelease;
  now: Date;
  countdownEnabled: boolean;
  onOpen: (item: MediaItem, context?: MediaOpenContext) => void;
}

function releaseOpenContext(release: GroupedUpcomingRelease): MediaOpenContext | undefined {
  const { seasonNumber, episodeNumber } = release.primaryRelease;
  if (seasonNumber === null && episodeNumber === null) return undefined;
  return {
    seasonNumber: seasonNumber ?? undefined,
    episodeNumber: episodeNumber ?? undefined,
  };
}

function CompactRelease({ release, now, countdownEnabled, onOpen }: CompactReleaseProps) {
  const { t, tn, date } = useI18n();
  const primary = release.primaryRelease;
  const exactTime = release.exactAirTime ? exactTimestampDate(release.exactAirTime) : null;
  const target = exactTime ?? localCalendarDate(release.airDate);
  const remaining = countdownEnabled && target ? countdownParts(target, now) : null;
  const displayTitle = releaseTitle(primary);
  const dateLabel = exactTime
    ? date(exactTime, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date(new Date(`${release.airDate}T12:00:00`), { month: 'short', day: 'numeric' });
  const phase = releasePhase(release, now);
  const statusLabel = releaseStatusLabel(release, now);
  const countdownText =
    phase === 'upcoming' && remaining && !remaining.elapsed
      ? formatCountdownInline(remaining)
      : null;

  return (
    <article
      className={`${styles.compactCard} ${phase === 'released' ? styles.compactCardReleased : ''}`}
    >
      <button
        type="button"
        className={styles.compactSpotlight}
        onClick={() => onOpen(release.favorite, releaseOpenContext(release))}
        aria-label={t('Open {title}', { title: displayTitle })}
      >
        <span className={styles.compactArtwork}>
          {primary.artworkUrl ? (
            <img src={primary.artworkUrl} alt="" loading="lazy" />
          ) : (
            <span className={styles.compactArtworkFallback} aria-hidden="true">
              <Film size={28} />
            </span>
          )}
        </span>

        <span className={styles.compactBody}>
          <span className={styles.compactHeader}>
            <span className={styles.compactEyebrow}>
              <CalendarClock size={12} aria-hidden="true" />
              <span>{dateLabel}</span>
              {statusLabel && !countdownText && (
                <span
                  className={phase === 'released' ? styles.releasedInline : styles.statusInline}
                >
                  <span className={styles.countdownDot} aria-hidden="true">
                    ·
                  </span>
                  <span>{t(statusLabel)}</span>
                </span>
              )}
              {countdownText && (
                <span className={styles.countdownInline} aria-label="Release countdown">
                  <span className={styles.countdownDot} aria-hidden="true">
                    ·
                  </span>
                  <span>{countdownText}</span>
                </span>
              )}
            </span>
            <ChevronRight className={styles.compactChevron} size={15} aria-hidden="true" />
          </span>

          <div className={styles.compactTitleGroup}>
            <strong className={styles.compactTitle}>{displayTitle}</strong>
            <span className={styles.compactSubtitle}>
              {release.summarySubtitle}
              {(release.followingReleaseCount ?? 0) > 0 && (
                <>
                  {' '}
                  ·{' '}
                  {tn(
                    '{count} more announced',
                    '{count} more announced',
                    release.followingReleaseCount ?? 0,
                  )}
                </>
              )}
            </span>
          </div>
        </span>
      </button>
    </article>
  );
}

function ScheduleReleaseTile({ release, now, countdownEnabled, onOpen }: CompactReleaseProps) {
  const { t, date } = useI18n();
  const primary = release.primaryRelease;
  const exactTime = release.exactAirTime ? exactTimestampDate(release.exactAirTime) : null;
  const target = exactTime ?? localCalendarDate(release.airDate);
  const remaining = countdownEnabled && target ? countdownParts(target, now) : null;
  const displayTitle = releaseTitle(primary);
  const dateLabel = exactTime
    ? date(exactTime, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : date(new Date(`${release.airDate}T12:00:00`), {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

  const phase = releasePhase(release, now);
  const statusLabel = releaseStatusLabel(release, now);
  const eyebrowLabel =
    phase === 'released'
      ? t('Recently released')
      : release.episodeCount > 1
        ? t('{count} episodes', { count: release.episodeCount })
        : release.kind === 'movie'
          ? t('Movie premiere')
          : t('Upcoming episode');
  const countdownText =
    phase === 'upcoming' && remaining && !remaining.elapsed
      ? formatCountdownInline(remaining)
      : null;

  return (
    <article
      className={`${styles.releaseTile} ${phase === 'released' ? styles.releaseTileReleased : ''}`}
    >
      <button
        type="button"
        className={styles.releaseTileAction}
        onClick={() => onOpen(release.favorite, releaseOpenContext(release))}
        aria-label={t('Open {title}', { title: displayTitle })}
      >
        <span className={styles.releaseTileHeader}>
          <span className={styles.releaseTileArtwork}>
            {primary.artworkUrl ? (
              <img src={primary.artworkUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.releaseTileArtworkFallback} aria-hidden="true">
                <Film size={24} />
              </span>
            )}
          </span>
          <span className={styles.releaseTileCopy}>
            <span className={styles.releaseTileTop}>
              <span className={styles.releaseTileEyebrow}>{eyebrowLabel}</span>
              <strong className={styles.releaseTileTitle}>{displayTitle}</strong>
              <span className={styles.releaseTileEpisode}>{release.summarySubtitle}</span>
            </span>

            <span className={styles.releaseTileMeta}>
              <span className={styles.releaseTileDate}>
                <CalendarClock size={11} aria-hidden="true" />
                <time dateTime={exactTime?.toISOString() ?? release.airDate}>{dateLabel}</time>
              </span>
              {statusLabel && !countdownText && (
                <span
                  className={phase === 'released' ? styles.releasedInline : styles.statusInline}
                >
                  <span>{t(statusLabel)}</span>
                </span>
              )}
              {countdownText && (
                <span className={styles.countdownInline} aria-label="Release countdown">
                  <span>{countdownText}</span>
                </span>
              )}
            </span>
          </span>
          <ChevronRight className={styles.releaseTileChevron} size={17} aria-hidden="true" />
        </span>
      </button>
    </article>
  );
}

export function UpcomingReleaseCard({
  onOpen,
  onViewAll,
  showEmpty = false,
  variant = 'discover',
  limit,
  releases: customReleases,
  now: providedNow,
}: UpcomingReleaseCardProps) {
  const { t } = useI18n();
  const schedule = useUpcomingReleases();
  const countdownEnabled = useSettingsStore((state) => state.upcomingCountdownEnabled);
  const historyDays = useSettingsStore((state) => state.upcomingHistoryDays);
  const [internalNow, setInternalNow] = useState(() => new Date());
  const now = providedNow ?? internalNow;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (providedNow) return undefined;
    const timer = window.setInterval(
      () => setInternalNow(new Date()),
      countdownEnabled ? 1_000 : 60_000,
    );
    return () => window.clearInterval(timer);
  }, [countdownEnabled, providedNow]);

  const groupedReleases = useMemo(() => {
    const rawReleases = schedule.data ?? [];
    const grouped = customReleases ?? groupUpcomingReleases(rawReleases);
    if (customReleases) return grouped;
    const horizons = groupReleasesByHorizon(grouped, now, historyDays);
    return variant === 'discover'
      ? nextReleasePerFavorite(
          [...horizons.today, ...horizons.thisWeek, ...horizons.nextWeek, ...horizons.later],
          now,
        )
      : [
          ...horizons.recentlyReleased,
          ...horizons.today,
          ...horizons.thisWeek,
          ...horizons.nextWeek,
          ...horizons.later,
        ];
  }, [customReleases, historyDays, now, schedule.data, variant]);
  const displayedReleases = limit && limit > 0 ? groupedReleases.slice(0, limit) : groupedReleases;
  const hasReleases = displayedReleases.length > 0;

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const tolerance = 2;
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - tolerance);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    window.addEventListener('resize', updateScrollState);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [displayedReleases.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.8;
      scrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth',
      });
    }
  };
  if (!schedule.isEnabled && !showEmpty) return null;
  if (schedule.isEnabled && !schedule.isLoading && !hasReleases && !showEmpty) return null;

  return (
    <section
      className={`${styles.section} ${styles[variant]}`}
      aria-labelledby={variant === 'discover' ? 'coming-up-heading' : undefined}
    >
      {variant === 'discover' && (
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle} id="coming-up-heading">
              {t('Coming Up')}
            </h2>
            <p className={styles.sectionSubtitle}>{t('The next release from each favorite')}</p>
          </div>
          <div className={styles.headerActions}>
            {displayedReleases.length > 1 && (
              <div className={styles.controls}>
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => scroll('left')}
                  disabled={!canScrollLeft}
                  aria-label={t('Scroll Coming Up left')}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => scroll('right')}
                  disabled={!canScrollRight}
                  aria-label={t('Scroll Coming Up right')}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
            {onViewAll && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewAll}
                className={styles.scheduleButton}
              >
                <span>{t('View schedule')}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      )}

      {!schedule.isEnabled ? (
        <div className={styles.statusPanel}>
          <CalendarClock size={20} aria-hidden="true" />
          <span>
            {t('Add a movie or series to Favorites and connect TMDB to see its next release here.')}
          </span>
        </div>
      ) : schedule.isLoading ? (
        <div className={styles.statusPanel} role="status">
          <CalendarClock size={20} aria-hidden="true" />
          <span>{t('Checking your favorite movies and series…')}</span>
        </div>
      ) : !hasReleases ? (
        <div className={styles.statusPanel}>
          <CalendarClock size={20} aria-hidden="true" />
          <span>
            {schedule.isError
              ? t('Could not check release dates right now.')
              : t('No release dates are currently listed for your favorites.')}
            {schedule.isError && (
              <small className={styles.technicalError}>
                {getErrorMessage(
                  schedule.error,
                  'Release schedule query failed without an error message.',
                )}
              </small>
            )}
          </span>
        </div>
      ) : variant === 'discover' ? (
        <div className={styles.carouselArea} ref={scrollRef} onScroll={updateScrollState}>
          <div className={styles.carouselTrack}>
            {displayedReleases.map((group) => (
              <div key={`${group.favorite.id}-${group.airDate}`} className={styles.carouselItem}>
                <CompactRelease
                  release={group}
                  now={now}
                  countdownEnabled={countdownEnabled}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.releaseGrid} aria-label={t('Scheduled releases')}>
          {displayedReleases.map((group) => (
            <ScheduleReleaseTile
              key={`${group.favorite.id}-${group.airDate}`}
              release={group}
              now={now}
              countdownEnabled={countdownEnabled}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
