import { useMemo, type ReactNode } from 'react';
import { PageTransition } from '@/app/shell/PageTransition';
import { HorizontalCarousel } from '@/modules/catalog/components/HorizontalCarousel';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import {
  useSettingsStore,
  type HomeSectionId,
} from '@/modules/settings/public/store/useSettingsStore';
import { historyCardSubtitle } from '@/shared/lib/time';
import { MediaDetailsDialogs } from '../details/MediaDetailsDialogs';
import { useMediaDetailState } from '../hooks/useMediaDetailsState';
import { CarouselSkeleton } from '@/shared/ui/Skeleton';
import { Tv } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useNavigate } from 'react-router-dom';
import { HeaderSearch } from '@/modules/search/public/components/HeaderSearch';
import styles from '@/app/shell/AppLayout.module.css';
import { useVisibleCatalog } from '../data/useCategories';
import { ErrorState } from '@/shared/ui/ErrorState';
import { getCombinedErrorMessage, getErrorPresentation } from '@/shared/lib/error';
import { useEnabledSources } from '@/modules/sources/public/hooks/useEnabledSources';
import { useI18n } from '@/shared/i18n/i18n';
import { UpcomingReleaseCard } from '@/modules/guide/public/components/UpcomingReleaseCard';

export function HomePage() {
  const { t, language } = useI18n();
  const sources = useEnabledSources();
  const history = useLibraryStore((state) => state.history);
  const upcomingEnabled = useSettingsStore((state) => state.upcomingEnabled);
  const upcomingHomeEnabled = useSettingsStore((state) => state.upcomingHomeEnabled);
  const homeSections = useSettingsStore((state) => state.homeSections);
  const navigate = useNavigate();
  const hasSource = sources.isAvailable;
  const showUpcomingOnHome = upcomingEnabled && upcomingHomeEnabled;

  const { selectedMovie, selectedSeries, handleCloseMovie, handleCloseSeries, handleItemClick } =
    useMediaDetailState();

  const continueWatchingItems = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history]
      .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
      .slice(0, 20)
      .map((h) => ({
        ...h,
        progress: h.progressPercentage ? h.progressPercentage / 100 : undefined,
        subtitle: historyCardSubtitle(h, language),
      }));
  }, [history, language]);

  // Use unified query keys shared across the entire application
  // Home has no category picker, so hidden material should simply never
  // appear here — unlike the catalogue pages, where choosing a hidden
  // category outright still has to work.
  const moviesQuery = useVisibleCatalog('vod');
  const { data: movies = [], isLoading: loadingMovies } = moviesQuery;

  const seriesQuery = useVisibleCatalog('series');
  const { data: series = [], isLoading: loadingSeries } = seriesQuery;

  const liveQuery = useVisibleCatalog('live');
  const { data: liveChannelsData = [], isLoading: loadingLive } = liveQuery;

  const recentMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => Number.parseInt(b.added || '0', 10) - Number.parseInt(a.added || '0', 10))
      .slice(0, 20);
  }, [movies]);

  const recentSeries = useMemo(() => {
    return [...series]
      .sort((a, b) => Number.parseInt(b.added || '0', 10) - Number.parseInt(a.added || '0', 10))
      .slice(0, 20);
  }, [series]);

  const popularMovies = useMemo(() => {
    return [...movies].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 20);
  }, [movies]);

  const popularSeries = useMemo(() => {
    return [...series].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 20);
  }, [series]);

  const liveChannels = useMemo(() => {
    return liveChannelsData.slice(0, 20);
  }, [liveChannelsData]);

  const isLoading = loadingMovies || loadingSeries || loadingLive;
  const catalogError = getCombinedErrorMessage(
    [moviesQuery.error, seriesQuery.error, liveQuery.error],
    '',
  );
  const hasCatalogData = movies.length > 0 || series.length > 0 || liveChannelsData.length > 0;
  const showLoadError = Boolean(catalogError) && !hasCatalogData;
  const errorPresentation = getErrorPresentation(catalogError, 'Home');
  const failedCatalogQueries = [moviesQuery, seriesQuery, liveQuery].filter(
    (query) => query.isError,
  );
  const isRetrying = failedCatalogQueries.some((query) => query.isFetching);
  const retryCatalogs = () => {
    void Promise.all(failedCatalogQueries.map((query) => query.refetch()));
  };

  // Sections beyond Continue Watching and Coming Up always render once
  // enabled — they never had an item-count gate before this became
  // reorderable/toggleable, and users who bother to disable a row expect it
  // to actually be gone, not conditionally back the moment it has content.
  const sectionVisible: Record<HomeSectionId, boolean> = {
    upcoming: showUpcomingOnHome,
    continueWatching: continueWatchingItems.length > 0,
    recentMovies: true,
    recentSeries: true,
    popularMovies: true,
    popularSeries: true,
    liveChannels: true,
  };
  const activeSectionIds = homeSections
    .filter((section) => section.enabled && sectionVisible[section.id])
    .map((section) => section.id);

  const renderSection = (id: HomeSectionId, loading: boolean): ReactNode => {
    switch (id) {
      case 'upcoming':
        return (
          <UpcomingReleaseCard
            key={id}
            onOpen={handleItemClick}
            onViewAll={() => navigate('/upcoming')}
            showEmpty
          />
        );
      case 'continueWatching':
        return loading ? (
          <CarouselSkeleton key={id} title="Continue Watching" />
        ) : (
          <HorizontalCarousel
            key={id}
            title="Continue Watching"
            items={continueWatchingItems}
            onItemClick={handleItemClick}
            onSeeAll={() => navigate('/continue')}
          />
        );
      case 'recentMovies':
        return loading ? (
          <CarouselSkeleton key={id} title="Recently Added Movies" />
        ) : (
          <HorizontalCarousel
            key={id}
            title="Recently Added Movies"
            items={recentMovies}
            onItemClick={handleItemClick}
            onSeeAll={() => navigate('/movies')}
          />
        );
      case 'recentSeries':
        return loading ? (
          <CarouselSkeleton key={id} title="Recently Added Series" />
        ) : (
          <HorizontalCarousel
            key={id}
            title="Recently Added Series"
            items={recentSeries}
            onItemClick={handleItemClick}
            onSeeAll={() => navigate('/series')}
          />
        );
      case 'popularMovies':
        return loading ? (
          <CarouselSkeleton key={id} title="Popular Movies" />
        ) : (
          <HorizontalCarousel
            key={id}
            title="Popular Movies"
            items={popularMovies}
            onItemClick={handleItemClick}
            onSeeAll={() => navigate('/movies')}
          />
        );
      case 'popularSeries':
        return loading ? (
          <CarouselSkeleton key={id} title="Popular Series" />
        ) : (
          <HorizontalCarousel
            key={id}
            title="Popular Series"
            items={popularSeries}
            onItemClick={handleItemClick}
            onSeeAll={() => navigate('/series')}
          />
        );
      case 'liveChannels':
        return loading ? (
          <CarouselSkeleton key={id} title="Live TV Channels" isLiveTv />
        ) : (
          <HorizontalCarousel
            key={id}
            title="Live TV Channels"
            items={liveChannels}
            onItemClick={handleItemClick}
            onSeeAll={() => navigate('/live')}
            isLiveTv
          />
        );
      default:
        return null;
    }
  };

  return (
    <PageTransition>
      <div className={styles.page}>
        <div className={`${styles.pageHeader} ${styles.homeHeader}`}>
          <div className={styles.homeTitleGroup}>
            <h1 className={styles.pageTitle}>{t('Home')}</h1>
            <p className={styles.pageSubtitle}>
              {t("Pick up where you left off and discover what's new")}
            </p>
          </div>
          <div className={styles.homeSearch}>
            <HeaderSearch onItemClick={handleItemClick} placeholder="Search your library" />
          </div>
        </div>

        {!hasSource ? (
          <EmptyState
            icon={Tv}
            title="No Source Available"
            description="Connect an Xtream account or add an M3U playlist to fill Home with available media."
            actionLabel="Manage Sources"
            onAction={() => navigate('/settings?section=sources')}
          />
        ) : isLoading ? (
          <div className={`${styles.homeScrollContainer} subtle-scrollbar`}>
            {activeSectionIds.map((id) => renderSection(id, true))}
          </div>
        ) : showLoadError ? (
          <ErrorState
            title={errorPresentation.title}
            description={errorPresentation.description}
            detail={errorPresentation.detail}
            actionLabel="Try Again"
            onAction={retryCatalogs}
            isRetrying={isRetrying}
          />
        ) : (
          <div className={`${styles.homeScrollContainer} subtle-scrollbar`}>
            {activeSectionIds.map((id) => renderSection(id, false))}
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
