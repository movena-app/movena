import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Film,
  Heart,
  Radio,
  Search as SearchIcon,
  Star,
  Tv,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MediaItem } from '@/modules/catalog/public/model/media';
import { useSearchStore } from '../store/useSearchStore';
import { smartSearch } from '../lib/search';
import styles from './HeaderSearch.module.css';
import {
  useLiveStreams,
  useVodStreams,
  useSeriesList,
} from '@/modules/catalog/public/data/useCatalog';
import { getDisplayTitle, parseMediaDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';
import { useI18n } from '@/shared/i18n/i18n';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { getCombinedErrorMessage } from '@/shared/lib/error';
import { IconButton } from '@/shared/ui/Button';

/** How long after closing to ignore a `focus` event on the input.
 *
 * Selecting a suggestion/recent term never blurs the input — the buttons
 * `preventDefault()` on `mousedown` specifically so the input doesn't lose
 * focus mid-click — so it's still `document.activeElement` the instant
 * `handleItemSelect`/`handleSelectRecent`/`handleSubmit` close the dropdown.
 * Something afterwards (observed: opening a detail modal from a suggestion)
 * was re-firing a genuine `focus` event on that still-focused input, and
 * `onFocus` has no way to tell that apart from the user genuinely refocusing
 * it — reopening "Recent searches" over whatever had just opened. Forcing a
 * real `blur()` plus a short suppression window closes the gap regardless of
 * what exactly re-fires the event.
 */
const REFOCUS_SUPPRESS_MS = 400;
const SUGGESTION_DEBOUNCE_MS = 120;
const MIN_SUGGESTION_QUERY_LENGTH = 2;

interface HeaderSearchProps {
  onItemClick?: ((item: MediaItem) => void) | undefined;
  placeholder?: string | undefined;
  ariaLabel?: string | undefined;
}

export function HeaderSearch({
  onItemClick,
  placeholder = 'Search...',
  ariaLabel = 'Search your library',
}: HeaderSearchProps) {
  const { t, tn, number } = useI18n();
  const [query, setQuery] = useState('');
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const navigate = useNavigate();
  const popupId = useId();

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressFocusUntilRef = useRef(0);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(
    null,
  );

  /** The one place that actually closes the dropdown — every selection path
   * routes through this instead of calling `setIsFocused(false)` directly. */
  const closeDropdown = () => {
    setIsFocused(false);
    setActiveOptionIndex(-1);
    suppressFocusUntilRef.current = Date.now() + REFOCUS_SUPPRESS_MS;
    inputRef.current?.blur();
  };

  const recentSearches = useSearchStore((state) => state.recentSearches);
  const addRecentSearch = useSearchStore((state) => state.addRecentSearch);
  const removeRecentSearch = useSearchStore((state) => state.removeRecentSearch);
  const clearRecentSearches = useSearchStore((state) => state.clearRecentSearches);
  const favorites = useLibraryStore((state) => state.favorites);
  const watched = useLibraryStore((state) => state.watched);
  const customRules = useSettingsStore((state) => state.customTitleRules);

  const updateDropdownPosition = () => {
    if (searchWrapperRef.current) {
      const rect = searchWrapperRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
  };

  // Position changes with the anchor, scrolling, or the window — not with each
  // character. Keeping query out of this effect avoids a layout read plus a
  // redundant state update on every keystroke.
  useEffect(() => {
    if (!isFocused) return;

    updateDropdownPosition();

    const handleScrollOrResize = () => {
      updateDropdownPosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isFocused]);

  // Large providers can expose tens of thousands of entries. Waiting for a
  // short pause keeps input updates immediate and collapses a fast burst of
  // keystrokes into one catalogue scan.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SUGGESTION_QUERY_LENGTH) {
      setSuggestionQuery('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuggestionQuery(trimmed);
    }, SUGGESTION_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  // Handle clicking outside the search component or dropdown
  useEffect(() => {
    if (!isFocused) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // `dropdownRef` is only attached while a dropdown is actually rendered
      // (both are conditionally portaled). Requiring it truthy meant any
      // outside click landing in a moment with neither dropdown mounted —
      // easy to hit, since `isFocused` alone doesn't guarantee one is
      // showing — silently skipped closing altogether, leaving `isFocused`
      // stuck `true`. It would then resurface later as soon as a dropdown's
      // condition became true again (e.g. once a search elsewhere added a
      // recent-search entry), reappearing over whatever was on screen by
      // then. `?.contains` treats "no dropdown mounted" as "click wasn't in
      // it", which is what should always have happened.
      if (
        searchWrapperRef.current &&
        !searchWrapperRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        closeDropdown();
      }
    };

    const handleFocusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!searchWrapperRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('focusin', handleFocusOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('focusin', handleFocusOutside);
    };
  }, [isFocused]);

  // Share cache with main catalog queries
  const searchEnabled = suggestionQuery.length >= MIN_SUGGESTION_QUERY_LENGTH;
  const { data: movies = [], error: moviesError } = useVodStreams({ enabled: searchEnabled });

  const { data: series = [], error: seriesError } = useSeriesList({ enabled: searchEnabled });

  const { data: live = [], error: liveError } = useLiveStreams({
    enabled: searchEnabled,
  });
  const suggestionError = getCombinedErrorMessage([moviesError, seriesError, liveError], '');

  const searchableItems = useMemo(
    () => (searchEnabled ? [...movies, ...series, ...live] : []),
    [searchEnabled, movies, series, live],
  );

  // Calculate smart search suggestions
  const suggestions = useMemo(() => {
    if (suggestionQuery.length < MIN_SUGGESTION_QUERY_LENGTH) return [];
    return smartSearch(searchableItems, suggestionQuery).slice(0, 5);
  }, [searchableItems, suggestionQuery]);

  const recentOptions = recentSearches.slice(0, 6);
  const showRecentDropdown = isFocused && !query.trim() && recentOptions.length > 0;
  const currentSuggestionQuery = query.trim();
  const isSuggestionPending =
    currentSuggestionQuery.length >= MIN_SUGGESTION_QUERY_LENGTH &&
    currentSuggestionQuery !== suggestionQuery;
  const showSuggestionsDropdown =
    isFocused && suggestionQuery.length >= MIN_SUGGESTION_QUERY_LENGTH;
  const isDropdownOpen = showRecentDropdown || showSuggestionsDropdown;
  const optionCount = showRecentDropdown
    ? recentOptions.length
    : showSuggestionsDropdown && !isSuggestionPending && suggestions.length > 0
      ? suggestions.length + 1
      : 0;
  const activeOptionId =
    activeOptionIndex >= 0 && optionCount > 0
      ? `${popupId}-option-${showRecentDropdown ? 'recent' : 'suggestion'}-${activeOptionIndex}`
      : undefined;

  useEffect(() => {
    setActiveOptionIndex(-1);
  }, [query, suggestionQuery, showRecentDropdown, showSuggestionsDropdown]);

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      addRecentSearch(trimmed);
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      closeDropdown();
    }
  };

  const handleSelectRecent = (term: string) => {
    addRecentSearch(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
    setQuery('');
    closeDropdown();
  };

  const handleItemSelect = (item: MediaItem) => {
    if (query.trim()) {
      addRecentSearch(query.trim());
    }
    if (onItemClick) {
      onItemClick(item);
    } else {
      navigate(`/search?q=${encodeURIComponent(getDisplayTitle(item.title, item.type))}`);
    }
    setQuery('');
    closeDropdown();
  };

  const handleViewAll = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    addRecentSearch(trimmed);
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    closeDropdown();
  };

  const handleToggleFavorite = (event: React.MouseEvent, item: MediaItem, isFavorite: boolean) => {
    event.stopPropagation();
    const library = useLibraryStore.getState();
    if (isFavorite) library.removeFavorite(item.id);
    else library.addFavorite(item);
  };

  const handleToggleWatched = (event: React.MouseEvent, item: MediaItem) => {
    event.stopPropagation();
    useLibraryStore.getState().toggleWatched(item.id);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && isDropdownOpen) {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && optionCount > 0) {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveOptionIndex((index) => {
        if (index < 0) return direction > 0 ? 0 : optionCount - 1;
        return (index + direction + optionCount) % optionCount;
      });
      return;
    }

    if (event.key !== 'Enter' || activeOptionIndex < 0 || optionCount === 0) return;
    event.preventDefault();

    if (showRecentDropdown) {
      const term = recentOptions[activeOptionIndex];
      if (term) handleSelectRecent(term);
      return;
    }

    const item = suggestions[activeOptionIndex];
    if (item) handleItemSelect(item);
    else if (activeOptionIndex === suggestions.length) handleViewAll();
  };

  return (
    <div ref={searchWrapperRef} className={styles.searchWrapper}>
      <form onSubmit={handleSubmit} className={styles.headerSearch}>
        <SearchIcon className={styles.searchIcon} size={18} />
        <input
          ref={inputRef}
          type="text"
          placeholder={t(placeholder)}
          className={`${styles.searchInput} uiField`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => {
            if (Date.now() < suppressFocusUntilRef.current) {
              debugLog.debug('search', 'Ignored a focus event right after closing the dropdown');
              return;
            }
            setIsFocused(true);
            updateDropdownPosition();
          }}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          role="combobox"
          aria-label={t(ariaLabel)}
          aria-autocomplete="list"
          aria-haspopup={showRecentDropdown ? 'dialog' : 'grid'}
          aria-expanded={isDropdownOpen}
          aria-controls={isDropdownOpen ? popupId : undefined}
          aria-activedescendant={activeOptionId}
        />
      </form>

      {showRecentDropdown &&
        dropdownPosition &&
        createPortal(
          <div
            ref={dropdownRef}
            id={popupId}
            className={`${styles.suggestionsDropdown} subtle-scrollbar`}
            role="dialog"
            aria-label={t('Recent searches')}
            style={{
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
            }}
          >
            <div className={styles.recentDropdownHeader}>
              <div className={styles.recentTitleGroup}>
                <Clock size={14} />
                <span>{t('Recent searches')}</span>
              </div>
              <button
                className={styles.clearAllBtn}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={clearRecentSearches}
                type="button"
              >
                {t('Clear history')}
              </button>
            </div>
            {recentOptions.map((term, index) => (
              <div
                key={term}
                className={`${styles.recentDropdownItem} ${activeOptionIndex === index ? styles.recentDropdownItemActive : ''}`}
              >
                <button
                  id={`${popupId}-option-recent-${index}`}
                  type="button"
                  className={styles.recentItemMain}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelectRecent(term)}
                  onMouseEnter={() => setActiveOptionIndex(index)}
                >
                  <Clock size={14} className={styles.recentItemIcon} aria-hidden="true" />
                  <span className={styles.recentItemText}>{term}</span>
                </button>
                <button
                  type="button"
                  className={styles.recentDeleteBtn}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentSearch(term);
                  }}
                  title={t('Remove "{term}"', { term })}
                  aria-label={t('Remove "{term}"', { term })}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}

      {showSuggestionsDropdown &&
        dropdownPosition &&
        createPortal(
          <div
            ref={dropdownRef}
            id={popupId}
            className={`${styles.suggestionsDropdown} ${suggestions.length > 0 ? styles.searchResultsDropdown : ''} ${isSuggestionPending ? styles.suggestionsUpdating : ''} subtle-scrollbar`}
            role={suggestions.length > 0 ? 'grid' : suggestionError ? 'alert' : 'status'}
            aria-label={suggestions.length > 0 ? t('Search suggestions') : undefined}
            aria-live={suggestions.length > 0 ? undefined : 'polite'}
            aria-busy={isSuggestionPending}
            style={{
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
            }}
          >
            {suggestions.length > 0 ? (
              <>
                <div role="row" className={styles.resultsSummaryRow}>
                  <div role="gridcell" className={styles.resultsSummary}>
                    <SearchIcon size={13} aria-hidden="true" />
                    <span>
                      {tn('{count} result found', '{count} results found', suggestions.length, {
                        count: number(suggestions.length),
                      })}
                    </span>
                  </div>
                </div>
                {suggestions.map((item, index) => {
                  const parsedTitle =
                    item.type === 'live'
                      ? null
                      : parseMediaDisplayTitle(item.title, item.year, customRules);
                  const displayTitle =
                    item.type === 'live'
                      ? getDisplayTitle(item.title, item.type, customRules)
                      : parsedTitle?.cleanTitle || item.title;
                  const displayYear = parsedTitle?.releaseYear;
                  const mediaType =
                    item.type === 'vod' ? 'Movie' : item.type === 'series' ? 'Series' : 'Live TV';
                  const displayRating =
                    typeof item.rating === 'number' && item.rating > 0
                      ? number(item.rating, { maximumFractionDigits: 1 })
                      : null;
                  const isFavorite = favorites.some((favorite) => favorite.id === item.id);
                  const isWatched = watched.includes(item.id);

                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      id={`${popupId}-option-suggestion-${index}`}
                      role="row"
                      aria-selected={activeOptionIndex === index}
                      aria-disabled={isSuggestionPending}
                      className={`${styles.suggestionItem} ${activeOptionIndex === index ? styles.suggestionItemActive : ''}`}
                      onMouseEnter={() => setActiveOptionIndex(index)}
                    >
                      <div role="gridcell" className={styles.suggestionMainCell}>
                        <button
                          type="button"
                          className={styles.suggestionMain}
                          disabled={isSuggestionPending}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleItemSelect(item)}
                        >
                          <span
                            className={`${styles.suggestionPosterFrame} ${item.type === 'live' ? styles.suggestionPosterLive : ''}`}
                            aria-hidden="true"
                          >
                            <span className={styles.suggestionPosterFallback}>
                              {item.type === 'live' ? (
                                <Radio size={18} />
                              ) : item.type === 'series' ? (
                                <Tv size={18} />
                              ) : (
                                <Film size={18} />
                              )}
                            </span>
                            {item.posterUrl && (
                              <img
                                src={item.posterUrl}
                                alt=""
                                className={styles.suggestionPoster}
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                          </span>
                          <span className={styles.suggestionDetails}>
                            <span className={styles.suggestionTitle}>{displayTitle}</span>
                            <span className={styles.suggestionMeta}>
                              <span className={styles.suggestionType}>{t(mediaType)}</span>
                              {displayYear && (
                                <span className={styles.suggestionYear}>{displayYear}</span>
                              )}
                              {displayRating && (
                                <span className={styles.suggestionRating}>
                                  <Star size={11} aria-hidden="true" />
                                  {displayRating}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </div>
                      <div role="gridcell" className={styles.suggestionActions}>
                        <IconButton
                          size="sm"
                          className={`${styles.suggestionAction} ${isFavorite ? styles.suggestionFavoriteActive : ''}`}
                          disabled={isSuggestionPending}
                          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          aria-pressed={isFavorite}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => handleToggleFavorite(event, item, isFavorite)}
                        >
                          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                        </IconButton>
                        {item.type !== 'live' && (
                          <IconButton
                            size="sm"
                            className={`${styles.suggestionAction} ${isWatched ? styles.suggestionWatchedActive : ''}`}
                            disabled={isSuggestionPending}
                            aria-label={isWatched ? 'Mark Unwatched' : 'Mark Watched'}
                            title={isWatched ? 'Mark Unwatched' : 'Mark Watched'}
                            aria-pressed={isWatched}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => handleToggleWatched(event, item)}
                          >
                            {isWatched ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                          </IconButton>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div
                  id={`${popupId}-option-suggestion-${suggestions.length}`}
                  role="row"
                  aria-selected={activeOptionIndex === suggestions.length}
                  className={styles.viewAllRow}
                  onMouseEnter={() => setActiveOptionIndex(suggestions.length)}
                >
                  <div role="gridcell" className={styles.viewAllCell}>
                    <button
                      type="button"
                      className={`${styles.viewAllLink} ${activeOptionIndex === suggestions.length ? styles.viewAllLinkActive : ''}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleViewAll}
                    >
                      <span className={styles.viewAllLabel}>
                        {t('View all results for “{query}”', { query })}
                      </span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.noSuggestions}>
                <span className={styles.noSuggestionsIcon} aria-hidden="true">
                  <SearchIcon size={17} />
                </span>
                <span className={styles.noSuggestionsCopy}>
                  <strong>
                    {t(suggestionError ? 'Quick search unavailable' : 'No quick matches')}
                  </strong>
                  <span className={suggestionError ? styles.technicalError : undefined}>
                    {suggestionError || t('Press Enter to search everything')}
                  </span>
                </span>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
