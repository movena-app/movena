import { useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarClock, Film, ListFilter, RefreshCw, Tv } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUpcomingReleases } from '../data/useUpcomingReleases';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MediaDetailsDialogs } from '@/modules/catalog/public/details/MediaDetailsDialogs';
import { PageTransition } from '@/app/shell/PageTransition';
import { UpcomingCalendar } from '../components/UpcomingCalendar';
import { UpcomingReleaseCard } from '../components/UpcomingReleaseCard';
import { Button } from '@/shared/ui/Button';
import { CatalogPageHeader } from '@/modules/catalog/public/components/CatalogPageHeader';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { useMediaDetailState } from '@/modules/catalog/public/hooks/useMediaDetailsState';
import { useI18n } from '@/shared/i18n/i18n';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import {
  filterUpcomingByKind,
  groupReleasesByHorizon,
  groupUpcomingReleases,
  type UpcomingKindFilter,
} from '../lib/upcoming';
import pageStyles from '@/app/shell/AppLayout.module.css';
import styles from './UpcomingPage.module.css';
import { getErrorMessage } from '@/shared/lib/error';

type ViewMode = 'timeline' | 'calendar';

export function UpcomingPage() {
  const { t, number, date } = useI18n();
  const favorites = useLibraryStore((state) => state.favorites);
  const tmdbEnabled = useSettingsStore((state) => state.tmdbEnabled);
  const tmdbApiKey = useSettingsStore((state) => state.tmdbApiKey);
  const upcomingEnabled = useSettingsStore((state) => state.upcomingEnabled);
  const upcomingCalendarEnabled = useSettingsStore((state) => state.upcomingCalendarEnabled);
  const countdownEnabled = useSettingsStore((state) => state.upcomingCountdownEnabled);
  const historyDays = useSettingsStore((state) => state.upcomingHistoryDays);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [kindFilter, setKindFilter] = useState<UpcomingKindFilter>('all');
  const [now, setNow] = useState(() => new Date());
  const {
    selectedMovie,
    selectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleItemClick: open,
  } = useMediaDetailState();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), countdownEnabled ? 1_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [countdownEnabled]);

  useEffect(() => {
    if (!upcomingCalendarEnabled && viewMode === 'calendar') setViewMode('timeline');
  }, [upcomingCalendarEnabled, viewMode]);

  const schedule = useUpcomingReleases();
  const groupedReleases = useMemo(
    () => groupUpcomingReleases(schedule.data ?? []),
    [schedule.data],
  );
  const filteredReleases = useMemo(
    () => filterUpcomingByKind(groupedReleases, kindFilter),
    [groupedReleases, kindFilter],
  );
  const horizons = useMemo(
    () => groupReleasesByHorizon(filteredReleases, now, historyDays),
    [filteredReleases, historyDays, now],
  );
  const allHorizons = useMemo(
    () => groupReleasesByHorizon(groupedReleases, now, historyDays),
    [groupedReleases, historyDays, now],
  );
  const recentlyReleasedCount = allHorizons.recentlyReleased.length;
  const upcomingCount =
    allHorizons.today.length +
    allHorizons.thisWeek.length +
    allHorizons.nextWeek.length +
    allHorizons.later.length;
  const visibleCount =
    horizons.recentlyReleased.length +
    horizons.today.length +
    horizons.thisWeek.length +
    horizons.nextWeek.length +
    horizons.later.length;
  const visibleReleases = useMemo(
    () => [
      ...horizons.recentlyReleased,
      ...horizons.today,
      ...horizons.thisWeek,
      ...horizons.nextWeek,
      ...horizons.later,
    ],
    [horizons],
  );
  const trackedFavorites = favorites.filter(
    (item) => item.type === 'series' || item.type === 'vod',
  );
  const canLoadSchedule =
    upcomingEnabled && tmdbEnabled && Boolean(tmdbApiKey.trim()) && trackedFavorites.length > 0;
  const updatedLabel =
    schedule.dataUpdatedAt > 0
      ? date(schedule.dataUpdatedAt, { hour: 'numeric', minute: '2-digit' })
      : null;
  const headerMeta = schedule.isLoading
    ? t('Checking release dates…')
    : t('{upcoming} upcoming · {released} recently released', {
        upcoming: number(upcomingCount),
        released: number(recentlyReleasedCount),
      });

  return (
    <PageTransition>
      <div className={pageStyles.page}>
        <CatalogPageHeader
          title={t('Coming Up')}
          meta={canLoadSchedule ? headerMeta : t('Release dates for your saved movies and series')}
          actions={
            canLoadSchedule ? (
              <Button
                size="sm"
                onClick={() => void schedule.refetch()}
                disabled={schedule.isFetching}
                aria-label="Refresh release schedule"
              >
                <RefreshCw
                  className={schedule.isFetching ? styles.spinning : undefined}
                  size={14}
                  aria-hidden="true"
                />
                <span>{t(schedule.isFetching ? 'Updating…' : 'Refresh')}</span>
              </Button>
            ) : undefined
          }
        />

        {!upcomingEnabled ? (
          <EmptyState
            icon={CalendarClock}
            title={t('Coming Up is disabled')}
            description={t(
              'Enable the release schedule in Coming Up settings to track saved movies and series.',
            )}
            actionLabel={t('Open Settings')}
            onAction={() => navigate('/settings?section=coming-up')}
          />
        ) : !tmdbEnabled || !tmdbApiKey.trim() ? (
          <EmptyState
            icon={CalendarClock}
            title={t('Connect TMDB to see your schedule')}
            description={t(
              'Add a TMDB API key in Library & Metadata settings to check release dates for your favorites.',
            )}
            actionLabel={t('Open Settings')}
            onAction={() => navigate('/settings?section=library-metadata')}
          />
        ) : trackedFavorites.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t('No favorite movies or series yet')}
            description={t(
              'Add movies or series to Favorites and Movena will keep their upcoming and recent release dates here.',
            )}
          />
        ) : schedule.isLoading && !schedule.data ? (
          <EmptyState
            icon={CalendarClock}
            title={t('Building your release schedule')}
            description={t('Checking release dates for your favorite movies and series…')}
          />
        ) : schedule.isError && !schedule.data ? (
          <EmptyState
            icon={CalendarClock}
            title={t('Release schedule unavailable')}
            description={t(
              'Movena could not check release dates right now. Your favorites are unchanged.',
            )}
            detail={getErrorMessage(
              schedule.error,
              'Release schedule query failed without an error message.',
            )}
            actionLabel={t('Try Again')}
            onAction={() => void schedule.refetch()}
          />
        ) : (
          <div className={`${pageStyles.homeScrollContainer} subtle-scrollbar`}>
            <div className={styles.toolbar}>
              <SegmentedControl<UpcomingKindFilter>
                value={kindFilter}
                onChange={setKindFilter}
                size="sm"
                ariaLabel="Filter releases by type"
                options={[
                  { value: 'all', label: 'All', icon: ListFilter },
                  { value: 'episode', label: 'Series', icon: Tv },
                  { value: 'movie', label: 'Movies', icon: Film },
                ]}
              />
              <div className={styles.toolbarMeta} aria-live="polite">
                {updatedLabel && <span>{t('Updated {time}', { time: updatedLabel })}</span>}
                <span>{t('{count} shown', { count: number(visibleCount) })}</span>
              </div>
              {upcomingCalendarEnabled && (
                <SegmentedControl<ViewMode>
                  value={viewMode}
                  onChange={setViewMode}
                  size="sm"
                  ariaLabel="Release schedule view"
                  options={[
                    { value: 'timeline', label: 'Timeline', icon: ListFilter },
                    { value: 'calendar', label: 'Calendar', icon: Calendar },
                  ]}
                />
              )}
            </div>

            {viewMode === 'calendar' && upcomingCalendarEnabled ? (
              <UpcomingCalendar groups={visibleReleases} now={now} onOpen={open} />
            ) : (
              <div className={styles.timelineContainer}>
                {horizons.recentlyReleased.length > 0 && (
                  <section className={`${styles.timelineSection} ${styles.recentSection}`}>
                    <div className={styles.timelineHeadingRow}>
                      <h2 className={styles.timelineHeading}>{t('Recently Released')}</h2>
                      <span className={styles.timelineHint}>
                        {t('Kept for {count} days', { count: number(historyDays) })}
                      </span>
                    </div>
                    <UpcomingReleaseCard
                      onOpen={open}
                      variant="schedule"
                      releases={horizons.recentlyReleased}
                      now={now}
                    />
                  </section>
                )}

                {horizons.today.length > 0 && (
                  <section className={styles.timelineSection}>
                    <h2 className={styles.timelineHeading}>{t('Today')}</h2>
                    <UpcomingReleaseCard
                      onOpen={open}
                      variant="schedule"
                      releases={horizons.today}
                      now={now}
                    />
                  </section>
                )}

                {horizons.thisWeek.length > 0 && (
                  <section className={styles.timelineSection}>
                    <h2 className={styles.timelineHeading}>{t('Next 7 Days')}</h2>
                    <UpcomingReleaseCard
                      onOpen={open}
                      variant="schedule"
                      releases={horizons.thisWeek}
                      now={now}
                    />
                  </section>
                )}

                {horizons.nextWeek.length > 0 && (
                  <section className={styles.timelineSection}>
                    <h2 className={styles.timelineHeading}>{t('Following Week')}</h2>
                    <UpcomingReleaseCard
                      onOpen={open}
                      variant="schedule"
                      releases={horizons.nextWeek}
                      now={now}
                    />
                  </section>
                )}

                {horizons.later.length > 0 && (
                  <section className={styles.timelineSection}>
                    <h2 className={styles.timelineHeading}>{t('Later')}</h2>
                    <UpcomingReleaseCard
                      onOpen={open}
                      variant="schedule"
                      releases={horizons.later}
                      now={now}
                    />
                  </section>
                )}

                {visibleCount === 0 && (
                  <div className={styles.emptyFilter}>
                    <CalendarClock size={18} aria-hidden="true" />
                    <span>
                      {t(
                        kindFilter === 'all'
                          ? 'No release dates are currently listed for your favorites.'
                          : 'No releases match the selected media type.',
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <MediaDetailsDialogs
        selectedMovie={selectedMovie}
        selectedSeries={selectedSeries}
        onCloseMovie={handleCloseMovie}
        onCloseSeries={handleCloseSeries}
      />
    </PageTransition>
  );
}
