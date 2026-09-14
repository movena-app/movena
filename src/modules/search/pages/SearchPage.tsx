import { useState, useMemo, useEffect } from 'react';
import { Search as SearchIcon, SearchX, X, Film, MonitorPlay, Tv, LayoutGrid } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSearchParams } from 'react-router-dom';
import { VirtualizedGrid } from '@/modules/catalog/public/components/VirtualizedGrid';
import type { MediaItem } from '@/modules/catalog/public/model/media';
import { PageTransition } from '@/app/shell/PageTransition';
import { useSearchStore } from '../store/useSearchStore';
import { smartSearch } from '../lib/search';
import { GridSkeleton, TextLineSkeleton } from '@/shared/ui/Skeleton';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { CatalogViewToggle } from '@/modules/catalog/public/components/CatalogViewToggle';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import styles from '@/app/shell/AppLayout.module.css';
import searchStyles from './SearchPage.module.css';
import {
  useLiveStreams,
  useVodStreams,
  useSeriesList,
} from '@/modules/catalog/public/data/useCatalog';
import { ErrorState } from '@/shared/ui/ErrorState';
import { getCombinedErrorMessage, getErrorPresentation } from '@/shared/lib/error';
import { useEnabledSources } from '@/modules/sources/public/hooks/useEnabledSources';
import { CatalogPageHeader } from '@/modules/catalog/public/components/CatalogPageHeader';
import { MediaDetailsDialogs } from '@/modules/catalog/public/details/MediaDetailsDialogs';
import { useMediaDetailState } from '@/modules/catalog/public/hooks/useMediaDetailsState';
import { useI18n } from '@/shared/i18n/i18n';

type FilterType = 'all' | 'movies' | 'series' | 'live';

const FILTER_OPTIONS: { value: FilterType; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: 'All', icon: LayoutGrid },
  { value: 'movies', label: 'Movies', icon: Film },
  { value: 'series', label: 'Series', icon: MonitorPlay },
  { value: 'live', label: 'Live TV', icon: Tv },
];

function filterTypeFromParam(value: string | null): FilterType {
  return value === 'movies' || value === 'series' || value === 'live' ? value : 'all';
}

export function SearchPage() {
  const { t, tn, number } = useI18n();
  const sources = useEnabledSources();
  const viewMode = useSettingsStore((state) => state.viewMode);
  const [searchParams, setSearchParams] = useSearchParams();

  const recentSearches = useSearchStore((state) => state.recentSearches);
  const addRecentSearch = useSearchStore((state) => state.addRecentSearch);
  const removeRecentSearch = useSearchStore((state) => state.removeRecentSearch);
  const clearRecentSearches = useSearchStore((state) => state.clearRecentSearches);

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const filterType = filterTypeFromParam(searchParams.get('type'));

  const {
    selectedMovie,
    selectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleItemClick: handleOpenMedia,
  } = useMediaDetailState();

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearchQuery(q);
  }, [searchParams]);

  const handleQueryChange = (q: string) => {
    setSearchQuery(q);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  };

  const handleFilterChange = (nextFilter: FilterType) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextFilter === 'all') next.delete('type');
        else next.set('type', nextFilter);
        return next;
      },
      { replace: true },
    );
  };

  const handleSelectQuery = (term: string) => {
    handleQueryChange(term);
    addRecentSearch(term);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      addRecentSearch(searchQuery.trim());
    }
  };

  // Fetch all data (shares cache with Movies, Series, LiveTV pages)
  const moviesQuery = useVodStreams({ enabled: filterType === 'all' || filterType === 'movies' });
  const { data: movies = [], isLoading: loadingMovies } = moviesQuery;

  const seriesQuery = useSeriesList({ enabled: filterType === 'all' || filterType === 'series' });
  const { data: series = [], isLoading: loadingSeries } = seriesQuery;

  const liveQuery = useLiveStreams({ enabled: filterType === 'all' || filterType === 'live' });
  const { data: live = [], isLoading: loadingLive } = liveQuery;

  const isLoading =
    filterType === 'movies'
      ? loadingMovies
      : filterType === 'series'
        ? loadingSeries
        : filterType === 'live'
          ? loadingLive
          : loadingMovies || loadingSeries || loadingLive;

  // Memoize combined catalog references to avoid array re-allocations on every input keystroke
  const combinedCatalog = useMemo(() => {
    return {
      all: [...movies, ...series, ...live],
      movies,
      series,
      live,
    };
  }, [movies, series, live]);

  // Filter and rank search results using smart multi-token fuzzy matching
  const searchResults = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];

    const source = combinedCatalog[filterType] || combinedCatalog.all;
    return smartSearch(source, trimmed);
  }, [searchQuery, filterType, combinedCatalog]);

  const handleItemClick = (item: MediaItem) => {
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim());
    }
    handleOpenMedia(item);
  };

  const hasQuery = searchQuery.trim().length > 0;
  const selectedQuery =
    filterType === 'movies'
      ? moviesQuery
      : filterType === 'series'
        ? seriesQuery
        : filterType === 'live'
          ? liveQuery
          : null;
  const catalogError = getCombinedErrorMessage(
    selectedQuery ? [selectedQuery.error] : [moviesQuery.error, seriesQuery.error, liveQuery.error],
    '',
  );
  const relevantDataCount = selectedQuery?.data?.length ?? combinedCatalog.all.length;
  const showLoadError = Boolean(catalogError) && relevantDataCount === 0;
  const errorPresentation = getErrorPresentation(catalogError, 'Search results');
  const relevantCatalogQueries = selectedQuery
    ? [selectedQuery]
    : [moviesQuery, seriesQuery, liveQuery];
  const failedCatalogQueries = relevantCatalogQueries.filter((query) => query.isError);
  const retrySearchCatalog = () => {
    void Promise.all(failedCatalogQueries.map((query) => query.refetch()));
  };
  const isRetrying = failedCatalogQueries.some((query) => query.isFetching);

  return (
    <PageTransition>
      <div className={styles.page}>
        <CatalogPageHeader
          title="Search"
          meta={
            hasQuery && isLoading ? (
              <TextLineSkeleton width={140} />
            ) : hasQuery ? (
              tn('{count} result found', '{count} results found', searchResults.length, {
                count: number(searchResults.length),
              })
            ) : (
              t('Search across movies, series, and live channels')
            )
          }
          actions={hasQuery ? <CatalogViewToggle /> : undefined}
        />

        <div className={`${searchStyles.searchControls} ${styles.catalogInset}`}>
          <div className={searchStyles.searchBar}>
            <SearchIcon className={searchStyles.searchIcon} size={18} />
            <input
              type="text"
              placeholder={t('Search movies, series, or live channels')}
              aria-label={t('Search movies, series, or live channels')}
              className={`${searchStyles.searchInput} uiField`}
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className={searchStyles.clearInputBtn}
                onClick={() => handleQueryChange('')}
                title={t('Clear search')}
                aria-label={t('Clear search')}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <SegmentedControl
            ariaLabel="Search result type"
            value={filterType}
            onChange={handleFilterChange}
            options={FILTER_OPTIONS}
          />
        </div>

        <div className={searchStyles.results}>
          {!sources.isAvailable ? (
            <EmptyState
              icon={Tv}
              title="No Source Available"
              description="Connect an Xtream account or add an M3U playlist before searching media."
            />
          ) : hasQuery ? (
            isLoading ? (
              <GridSkeleton viewMode={viewMode} count={viewMode === 'list' ? 10 : 18} />
            ) : showLoadError ? (
              <ErrorState
                title={errorPresentation.title}
                description={errorPresentation.description}
                detail={errorPresentation.detail}
                actionLabel="Try Again"
                onAction={retrySearchCatalog}
                isRetrying={isRetrying}
              />
            ) : searchResults.length > 0 ? (
              <VirtualizedGrid items={searchResults} onItemClick={handleItemClick} />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No Results Found"
                description={t(
                  'We couldn\'t find any media matching "{query}". Try searching for something else.',
                  { query: searchQuery },
                )}
              />
            )
          ) : (
            <div className={searchStyles.idleContent}>
              {recentSearches.length > 0 && (
                <div className={searchStyles.recentSection}>
                  <div className={searchStyles.recentHeader}>
                    <div className={searchStyles.recentTitleGroup}>
                      <span>{t('Recent searches')}</span>
                    </div>
                    <button
                      type="button"
                      className={searchStyles.clearAllBtn}
                      onClick={() => clearRecentSearches()}
                    >
                      {t('Clear history')}
                    </button>
                  </div>
                  <div className={searchStyles.recentList}>
                    {recentSearches.map((term) => (
                      <div key={term} className={searchStyles.recentItem}>
                        <button
                          type="button"
                          className={searchStyles.recentSelectBtn}
                          aria-label={term}
                          onClick={() => handleSelectQuery(term)}
                        >
                          <span className={searchStyles.chipText}>{term}</span>
                        </button>
                        <button
                          type="button"
                          className={searchStyles.recentDeleteBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentSearch(term);
                          }}
                          title={t('Remove "{term}" from history', { term })}
                          aria-label={t('Remove "{term}" from history', { term })}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className={searchStyles.idleState}>
                <EmptyState
                  icon={SearchIcon}
                  title="Search Movena"
                  description="Type any title, genre, year, or keyword to instantly search across movies, series, and channels."
                />
              </div>
            </div>
          )}
        </div>
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
