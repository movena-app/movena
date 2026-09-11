import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pin,
  PinOff,
  RefreshCw,
  SearchX,
} from 'lucide-react';
import {
  RiHeartFill,
  RiHeartLine,
  RiLayoutGridFill,
  RiLayoutGridLine,
  RiSparklingFill,
  RiSparklingLine,
  RiStarFill,
  RiStarLine,
  RiTimeFill,
  RiTimeLine,
} from '@/shared/ui/icons';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import {
  useContextMenuStore,
  type ContextMenuItem,
} from '@/shared/ui/context-menu/useContextMenuStore';
import { CategorySkeleton } from '@/shared/ui/Skeleton';
import { useCatalogByType } from '../data/useCatalog';
import { useCategories, useHiddenCategoryIds } from '../data/useCategories';
import {
  countryName,
  hasCountryFlag,
  isCountryOnlyLabel,
  parseCategoryName,
} from '@/shared/lib/categoryName';
import { countHiddenCategories, isCategoryHidden } from '../lib/categorySidebar';
import {
  getPrimaryMediaTags,
  getTagColorType,
  isUltraHdQuality,
  mergeMediaTags,
} from '@/shared/lib/mediaTags';
import { useVerifiedResolutionMap } from '@/modules/sources/public/store/useStreamVerificationStore';
import { FourKQualityNotice } from './FourKQualityNotice';
import { CountryFlag } from '@/shared/ui/CountryFlag';
import { WorkspaceSidebar, WorkspaceSidebarSearch } from '@/shared/ui/WorkspaceSidebar';
import { StateIcon, type StateIconPair } from '@/shared/ui/StateIcon';
import styles from './CategorySidebar.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { getErrorMessage } from '@/shared/lib/error';

interface CategorySidebarProps {
  type: 'vod' | 'series' | 'live';
  activeCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
}

const decodeHtml = (html: string) => {
  if (!html) return '';
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
};

interface Row {
  id: string;
  categoryIds: string[];
  label: string;
  country: string | null;
  count: number;
  tags?: string[] | undefined;
}

interface CountryGroup {
  key: string;
  country: string | null;
  total: number;
  rows: Row[];
}

/**
 * A country-only category adds no hierarchy beneath the country selector.
 * Aliases such as Macedonia/North Macedonia, Turkey/Türkiye and UK/United Kingdom count as equivalents.
 */
function isRedundantCountryRow(row: Row, country: string | null): boolean {
  return isCountryOnlyLabel(row.label, country);
}

function countryChildRows(group: CountryGroup): Row[] {
  return group.rows.filter((row) => !isRedundantCountryRow(row, group.country));
}

function isDirectCountryGroup(group: CountryGroup): boolean {
  return Boolean(group.country && group.rows.length > 0 && countryChildRows(group).length === 0);
}

export function CategorySidebar({
  type,
  activeCategoryId,
  onSelectCategory,
}: CategorySidebarProps) {
  const { t, tn, number, language } = useI18n();
  const itemCountLabel = (count: number) =>
    type === 'live'
      ? tn('{count} channel', '{count} channels', count, { count: number(count) })
      : type === 'series'
        ? tn('{count} series', '{count} series', count, { count: number(count) })
        : tn('{count} title', '{count} titles', count, { count: number(count) });
  const categoryPrefs = useSettingsStore((s) => s.categoryPrefs);
  const toggleCategoryPref = useSettingsStore((s) => s.toggleCategoryPref);
  const setCollapsedCategories = useSettingsStore((s) => s.setCollapsedCategories);
  const openContextMenu = useContextMenuStore((s) => s.openContextMenu);
  const [showHidden, setShowHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFourKNotice, setShowFourKNotice] = useState(false);

  const storedWidth = useSettingsStore((s) => s.sidebarWidth) ?? 260;
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const badgeVisibility = useSettingsStore((s) => s.badgeVisibility);
  const verifiedResolutions = useVerifiedResolutionMap(badgeVisibility?.verified ?? true);
  const fourKDisclaimerDismissed = useSettingsStore((s) => s.fourKDisclaimerDismissed);

  const selectSmartHub = (hubId: string, isActive: boolean) => {
    if (!isActive && hubId === 'smart:4k' && !fourKDisclaimerDismissed) {
      setShowFourKNotice(true);
    }
    onSelectCategory(isActive ? null : hubId);
  };

  const dismissFourKNotice = () => {
    setShowFourKNotice(false);
    updateSetting('fourKDisclaimerDismissed', true);
  };

  const pinned = useMemo(() => categoryPrefs?.pinned?.[type] ?? [], [categoryPrefs, type]);
  const hidden = useMemo(() => categoryPrefs?.hidden?.[type] ?? [], [categoryPrefs, type]);
  const collapsed = useMemo(() => categoryPrefs?.collapsed?.[type] ?? [], [categoryPrefs, type]);
  const pinnedCountries = useMemo(
    () => categoryPrefs?.pinnedCountries?.[type] ?? [],
    [categoryPrefs, type],
  );
  const hiddenCountries = useMemo(
    () => categoryPrefs?.hiddenCountries?.[type] ?? [],
    [categoryPrefs, type],
  );
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const hiddenCountrySet = useMemo(() => new Set(hiddenCountries), [hiddenCountries]);

  const {
    data: categories = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useCategories(type);

  const { data: items = [] } = useCatalogByType(type);

  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const item of items) {
      if (!item.categoryId) continue;
      tally.set(item.categoryId, (tally.get(item.categoryId) ?? 0) + 1);
    }
    return tally;
  }, [items]);

  const hiddenCategoryIds = useHiddenCategoryIds(type);
  const favorites = useLibraryStore((s) => s.favorites);
  const catalogStats = useMemo(() => {
    const favSet = new Set(favorites.map((f) => f.id));
    let visibleTotal = 0;
    let favCount = 0;
    let recentCount = 0;
    let topRatedCount = 0;
    let fourKCount = 0;

    for (const item of items) {
      if (item.categoryId && hiddenCategoryIds.has(item.categoryId)) continue;
      visibleTotal += 1;
      if (favSet.has(item.id)) favCount += 1;
      if (item.added) recentCount += 1;
      if (typeof item.rating === 'number' && item.rating >= 7.0) topRatedCount += 1;
      if (isUltraHdQuality(item, verifiedResolutions.get(item.id))) {
        fourKCount += 1;
      }
    }

    return {
      visibleTotal,
      favorites: favCount,
      recent: recentCount,
      topRated: topRatedCount,
      fourK: fourKCount,
    };
  }, [items, favorites, hiddenCategoryIds, verifiedResolutions]);
  const visibleTotal = catalogStats.visibleTotal;
  const smartHubCounts = catalogStats;

  const smartHubs = useMemo(() => {
    const hubs: {
      id: string;
      label: string;
      count: number;
      icons: StateIconPair;
    }[] = [];

    if (smartHubCounts.favorites > 0) {
      hubs.push({
        id: 'smart:favorites',
        label: t('Favorites'),
        count: smartHubCounts.favorites,
        icons: { line: RiHeartLine, fill: RiHeartFill },
      });
    }

    if (type !== 'live' && smartHubCounts.recent > 0) {
      hubs.push({
        id: 'smart:recent',
        label: t('Recently Added'),
        count: smartHubCounts.recent,
        icons: { line: RiTimeLine, fill: RiTimeFill },
      });
    }

    if (type !== 'live' && smartHubCounts.topRated > 0) {
      hubs.push({
        id: 'smart:top-rated',
        label: t('Top Rated'),
        count: smartHubCounts.topRated,
        icons: { line: RiStarLine, fill: RiStarFill },
      });
    }

    if (smartHubCounts.fourK > 0) {
      hubs.push({
        id: 'smart:4k',
        label: t('4K Ultra HD'),
        count: smartHubCounts.fourK,
        icons: { line: RiSparklingLine, fill: RiSparklingFill },
      });
    }

    return hubs;
  }, [smartHubCounts, type, t]);

  const rows = useMemo<Row[]>(() => {
    const mergedMap = new Map<string, Row>();

    for (const cat of categories) {
      const id = String(cat.category_id);
      const { country, label, tags } = parseCategoryName(decodeHtml(cat.category_name || ''));
      const count = counts.get(id) ?? 0;
      const groupKey = `${country ?? 'other'}::${label.toLowerCase()}`;

      const existing = mergedMap.get(groupKey);
      if (existing) {
        existing.count += count;
        if (!existing.categoryIds.includes(id)) {
          existing.categoryIds.push(id);
        }
        if (tags && tags.length > 0) {
          existing.tags = mergeMediaTags(...(existing.tags || []), ...tags);
        }
      } else {
        mergedMap.set(groupKey, {
          id,
          categoryIds: [id],
          label,
          country,
          tags: tags ?? [],
          count,
        });
      }
    }

    return Array.from(mergedMap.values());
  }, [categories, counts]);

  const rowById = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of rows) {
      map.set(row.id, row);
      for (const id of row.categoryIds) {
        map.set(id, row);
      }
    }
    return map;
  }, [rows]);

  const isRowActive = (row: Row) =>
    activeCategoryId === row.id || row.categoryIds.includes(activeCategoryId || '');

  const isCategoryRowPinned = useCallback(
    (row: Row) => pinnedSet.has(row.id) || row.categoryIds.some((id) => pinnedSet.has(id)),
    [pinnedSet],
  );

  const isCategoryRowDirectlyHidden = (row: Row) =>
    hiddenSet.has(row.id) || row.categoryIds.some((id) => hiddenSet.has(id));

  // A saved selection can outlive the source that supplied it. Falling back
  // to All Categories avoids a blank catalogue with no corresponding active
  // row after a source is removed or replaces its category list.
  useEffect(() => {
    if (!activeCategoryId || isLoading || isError || activeCategoryId.startsWith('smart:')) return;
    const available = activeCategoryId.startsWith('country:')
      ? rows.some((row) => (row.country ?? 'other') === activeCategoryId.slice('country:'.length))
      : rowById.has(activeCategoryId);
    if (!available) onSelectCategory(null);
  }, [activeCategoryId, isError, isLoading, onSelectCategory, rowById, rows]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase().trim();
    return rows.filter((r) => {
      const cName = `${countryName(r.country, language)} ${countryName(r.country)}`.toLowerCase();
      const hasTagMatch = r.tags?.some((t) => t.toLowerCase().includes(query));
      return (
        r.label.toLowerCase().includes(query) ||
        cName.includes(query) ||
        (r.country && r.country.toLowerCase().includes(query)) ||
        hasTagMatch
      );
    });
  }, [language, rows, searchQuery]);

  const filteredRowById = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of filteredRows) {
      map.set(row.id, row);
      for (const id of row.categoryIds) {
        map.set(id, row);
      }
    }
    return map;
  }, [filteredRows]);

  const groups = useMemo(() => {
    const byCountry = new Map<string | null, CountryGroup>();
    for (const row of filteredRows) {
      if (isCategoryRowPinned(row)) continue;
      const isHidden = isCategoryHidden(row, hiddenSet, hiddenCountrySet);
      if (isHidden && !showHidden) continue;

      let group = byCountry.get(row.country);
      if (!group) {
        group = { key: row.country ?? 'other', country: row.country, total: 0, rows: [] };
        byCountry.set(row.country, group);
      }
      group.rows.push(row);
      if (!isHidden) group.total += row.count;
    }

    const all = [...byCountry.values()];

    const pinnedRanks = new Map(pinnedCountries.map((key, index) => [key, index]));
    const rank = (key: string) => pinnedRanks.get(key) ?? Number.MAX_SAFE_INTEGER;
    return all.sort((a, b) => rank(a.key) - rank(b.key));
  }, [filteredRows, hiddenCountrySet, hiddenSet, isCategoryRowPinned, showHidden, pinnedCountries]);

  const collapsibleGroups = useMemo(
    () => groups.filter((group) => countryChildRows(group).length > 0),
    [groups],
  );

  const allCollapsed = useMemo(() => {
    if (collapsibleGroups.length === 0) return false;
    return collapsibleGroups.every((group) => collapsed.includes(group.key));
  }, [collapsibleGroups, collapsed]);

  const handleToggleCollapseAll = () => {
    setCollapsedCategories(type, allCollapsed ? [] : collapsibleGroups.map((group) => group.key));
  };

  const pinnedRows = useMemo(() => {
    const seen = new Set<string>();
    const result: Row[] = [];
    for (const id of pinned) {
      const row = filteredRowById.get(id);
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        if (showHidden || !isCategoryHidden(row, hiddenSet, hiddenCountrySet)) {
          result.push(row);
        }
      }
    }
    return result;
  }, [pinned, filteredRowById, showHidden, hiddenSet, hiddenCountrySet]);

  // One category can be hidden directly and through its country. Count it once.
  const hiddenCount = countHiddenCategories(rows, hiddenSet, hiddenCountrySet);
  const hasSearch = searchQuery.trim().length > 0;
  const hiddenSearchMatchCount = hasSearch
    ? countHiddenCategories(filteredRows, hiddenSet, hiddenCountrySet)
    : 0;
  const displayedCategoryCount =
    pinnedRows.length +
    groups.reduce((total, group) => total + Math.max(1, countryChildRows(group).length), 0);

  const openActions = (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(rect.right + 4, rect.top, items, { focusOnOpen: true });
  };

  const toggleCategoryHidden = (row: Row) => {
    const isDirectlyHidden = isCategoryRowDirectlyHidden(row);
    const willHide = !isDirectlyHidden;
    if (willHide && isRowActive(row)) onSelectCategory(null);
    for (const id of row.categoryIds) {
      if (willHide ? !hiddenSet.has(id) : hiddenSet.has(id)) {
        toggleCategoryPref('hidden', type, id);
      }
    }
  };

  const toggleCategoryPinned = (row: Row) => {
    const isPinned = isCategoryRowPinned(row);
    const willPin = !isPinned;
    for (const id of row.categoryIds) {
      if (willPin ? !pinnedSet.has(id) : pinnedSet.has(id)) {
        toggleCategoryPref('pinned', type, id);
      }
    }
  };

  const categoryActions = (row: Row): ContextMenuItem[] => {
    const isPinned = isCategoryRowPinned(row);
    const isDirectlyHidden = isCategoryRowDirectlyHidden(row);
    const isHiddenWithCountry = hiddenCountrySet.has(row.country ?? 'other');
    return [
      {
        id: `pin-${row.id}`,
        label: isPinned ? 'Unpin category' : 'Pin category',
        icon: isPinned ? <PinOff size={15} /> : <Pin size={15} />,
        checked: isPinned,
        action: () => toggleCategoryPinned(row),
      },
      {
        id: `hide-${row.id}`,
        label:
          isHiddenWithCountry && !isDirectlyHidden
            ? t('Hidden with {country}', { country: countryName(row.country, language) })
            : isDirectlyHidden
              ? 'Show category'
              : 'Hide category',
        icon: isDirectlyHidden ? <Eye size={15} /> : <EyeOff size={15} />,
        checked: isDirectlyHidden || isHiddenWithCountry,
        disabled: isHiddenWithCountry && !isDirectlyHidden,
        action:
          isHiddenWithCountry && !isDirectlyHidden ? undefined : () => toggleCategoryHidden(row),
      },
    ];
  };

  const countryActions = (key: string, country: string | null): ContextMenuItem[] => {
    const isPinned = pinnedCountries.includes(key);
    const isHidden = hiddenCountrySet.has(key);
    const name = countryName(country, language);
    return [
      {
        id: `pin-country-${key}`,
        label: t(isPinned ? 'Unpin {name}' : 'Pin {name}', { name }),
        icon: isPinned ? <PinOff size={15} /> : <Pin size={15} />,
        checked: isPinned,
        action: () => toggleCategoryPref('pinnedCountries', type, key),
      },
      {
        id: `hide-country-${key}`,
        label: t(isHidden ? 'Show {name}' : 'Hide {name}', { name }),
        icon: isHidden ? <Eye size={15} /> : <EyeOff size={15} />,
        checked: isHidden,
        action: () => {
          const willHide = !isHidden;
          const activeRow = activeCategoryId ? rowById.get(activeCategoryId) : undefined;
          if (
            willHide &&
            (activeCategoryId === `country:${key}` || (activeRow?.country ?? 'other') === key)
          ) {
            onSelectCategory(null);
          }
          toggleCategoryPref('hiddenCountries', type, key);
        },
      },
    ];
  };

  const renderRow = (
    row: Row,
    options: { nested?: boolean | undefined; showCountry?: boolean | undefined } = {},
  ) => {
    const { nested = false, showCountry = false } = options;
    const isHidden = isCategoryHidden(row, hiddenSet, hiddenCountrySet);
    const isPinned = isCategoryRowPinned(row);
    const isActive = isRowActive(row);
    const visibleTags = getPrimaryMediaTags(row.tags ?? [], 1);
    const menuItems = categoryActions(row);
    const fullLabel = showCountry
      ? `${row.label}, ${countryName(row.country, language)}`
      : row.label;

    return (
      <div
        key={row.id}
        className={`${styles.row} ${nested ? styles.nestedRow : ''} ${
          isActive ? styles.active : ''
        } ${isHidden ? styles.hiddenRow : ''}`}
        onContextMenu={(event) => openActions(event, menuItems)}
      >
        <button
          type="button"
          className={`${styles.rowMain} ${nested ? styles.nestedRowMain : ''}`}
          onClick={() => onSelectCategory(isActive ? null : row.id)}
          title={row.count > 0 ? `${fullLabel} (${number(row.count)})` : fullLabel}
          aria-label={`${fullLabel}${row.count > 0 ? `, ${itemCountLabel(row.count)}` : ''}${isPinned ? `, ${t('pinned')}` : ''}${isHidden ? `, ${t('hidden')}` : ''}`}
          aria-pressed={isActive}
        >
          {showCountry &&
            row.country &&
            (hasCountryFlag(row.country) ? (
              <CountryFlag code={row.country} className={styles.rowFlag} />
            ) : (
              <span className={styles.countryCode}>{row.country}</span>
            ))}
          {isPinned && (
            <span className={styles.pinnedIndicator} title={t('Pinned')} aria-hidden="true">
              <Pin size={12} strokeWidth={2.25} />
            </span>
          )}
          <span className={styles.categoryLabel}>{row.label}</span>
          {isHidden && <EyeOff size={12} className={styles.hiddenIndicator} aria-hidden="true" />}
          {visibleTags.length > 0 && (
            <span className={styles.tagPills} title={row.tags?.join(', ')}>
              {visibleTags.map((tag) => (
                <span key={tag} className={styles.tagPill} data-tag-type={getTagColorType(tag)}>
                  {tag}
                </span>
              ))}
            </span>
          )}
          {row.count > 0 && <span className={styles.count}>{number(row.count)}</span>}
        </button>
        <button
          type="button"
          className={styles.rowMenuButton}
          onClick={(event) => openActions(event, menuItems)}
          aria-label={t('Actions for {name}', { name: fullLabel })}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    );
  };

  return (
    <>
      {showFourKNotice && <FourKQualityNotice onClose={dismissFourKNotice} />}
      <WorkspaceSidebar
        width={storedWidth}
        onWidthChange={(width) => updateSetting('sidebarWidth', width)}
        ariaLabel="Categories"
        headerContent={
          <>
            <WorkspaceSidebarSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search categories..."
              ariaLabel="Filter categories"
            />
            {hasSearch && (
              <div className={styles.searchStatus} role="status" aria-live="polite">
                <span>
                  {tn('{count} category', '{count} categories', displayedCategoryCount, {
                    count: number(displayedCategoryCount),
                  })}
                </span>
                {hiddenSearchMatchCount > 0 && (
                  <button
                    type="button"
                    className={styles.searchHiddenToggle}
                    onClick={() => setShowHidden((value) => !value)}
                  >
                    {showHidden
                      ? t('Hide hidden')
                      : t('Show {count} hidden', { count: number(hiddenSearchMatchCount) })}
                  </button>
                )}
              </div>
            )}
          </>
        }
      >
        {isLoading ? (
          <CategorySkeleton />
        ) : isError && categories.length === 0 ? (
          <div className={styles.categoryUnavailable} role="status" aria-live="polite">
            <span>
              <strong>{t('Categories unavailable')}</strong>
              <small>
                {getErrorMessage(error, 'Category query failed without an error message.')}
              </small>
            </span>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label={t('Retry loading categories')}
            >
              <RefreshCw
                size={14}
                className={isFetching ? styles.categoryRetrying : undefined}
                aria-hidden="true"
              />
              <span>{t(isFetching ? 'Retrying' : 'Retry')}</span>
            </button>
          </div>
        ) : (
          <>
            {!hasSearch && (
              <div
                className={`${styles.row} ${styles.allCategoriesRow} ${activeCategoryId === null ? styles.active : ''}`}
              >
                <button
                  type="button"
                  className={styles.rowMain}
                  onClick={() => onSelectCategory(null)}
                  aria-pressed={activeCategoryId === null}
                  aria-label={t('All categories, {count} available', {
                    count: number(visibleTotal),
                  })}
                >
                  <StateIcon
                    icons={{ line: RiLayoutGridLine, fill: RiLayoutGridFill }}
                    active={activeCategoryId === null}
                    size={14}
                    className={styles.allCategoriesIcon}
                  />
                  <span className={styles.categoryLabel}>{t('All Categories')}</span>
                  {visibleTotal > 0 && <span className={styles.count}>{number(visibleTotal)}</span>}
                </button>
                {collapsibleGroups.length > 0 && (
                  <button
                    type="button"
                    className={styles.rowMenuButton}
                    onClick={handleToggleCollapseAll}
                    aria-label={t(
                      allCollapsed ? 'Expand all categories' : 'Collapse all categories',
                    )}
                  >
                    {allCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
                  </button>
                )}
              </div>
            )}

            {!hasSearch && smartHubs.length > 0 && (
              <div className={styles.smartHubsSection}>
                {smartHubs.map((hub) => {
                  const isActive = activeCategoryId === hub.id;
                  return (
                    <div
                      key={hub.id}
                      className={`${styles.row} ${styles.smartHubRow} ${isActive ? styles.active : ''}`}
                    >
                      <button
                        type="button"
                        className={styles.rowMain}
                        onClick={() => selectSmartHub(hub.id, isActive)}
                        aria-pressed={isActive}
                        aria-label={`${hub.label}, ${itemCountLabel(hub.count)}`}
                      >
                        <StateIcon
                          icons={hub.icons}
                          active={isActive}
                          size={14}
                          className={styles.smartHubIcon}
                        />
                        <span className={styles.categoryLabel}>{hub.label}</span>
                        {hub.count > 0 && <span className={styles.count}>{number(hub.count)}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pinned section at the top */}
            {pinnedRows.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>
                  <span>{t('Pinned')}</span>
                </div>
                {pinnedRows.map((row) => renderRow(row, { showCountry: true }))}
              </div>
            )}

            {/* Country groups */}
            {groups.map((group) => {
              const key = group.key;
              const childRows = countryChildRows(group);
              const isDirectCountry = isDirectCountryGroup(group);
              const isCollapsed = hasSearch ? false : collapsed.includes(key);
              const isHiddenCountry = hiddenCountrySet.has(key);
              const countryId = `country:${key}`;
              const isActive = activeCategoryId === countryId;
              const isPinnedCountry = pinnedCountries.includes(key);
              const menuItems = countryActions(key, group.country);
              return (
                <div key={key} className={styles.group}>
                  <div
                    className={`${styles.groupHeaderRow} ${isActive ? styles.active : ''} ${isHiddenCountry ? styles.hiddenRow : ''}`}
                    onContextMenu={(event) => openActions(event, menuItems)}
                  >
                    {!isDirectCountry && (
                      <button
                        type="button"
                        className={styles.groupCollapseButton}
                        onClick={() => toggleCategoryPref('collapsed', type, key)}
                        aria-expanded={!isCollapsed}
                        aria-label={t(isCollapsed ? 'Expand {name}' : 'Collapse {name}', {
                          name: countryName(group.country, language),
                        })}
                      >
                        <ChevronDown
                          size={13}
                          className={`${styles.chevron} ${isCollapsed ? styles.chevronCollapsed : ''}`}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.groupHeader} ${isDirectCountry ? styles.directCountryHeader : ''}`}
                      onClick={() => onSelectCategory(isActive ? null : countryId)}
                      aria-pressed={isActive}
                      aria-label={`${countryName(group.country, language)}, ${itemCountLabel(group.total)}${isPinnedCountry ? `, ${t('pinned')}` : ''}`}
                    >
                      {group.country && hasCountryFlag(group.country) ? (
                        <CountryFlag code={group.country} className={styles.flag} />
                      ) : (
                        group.country && <span className={styles.countryCode}>{group.country}</span>
                      )}
                      {isPinnedCountry && (
                        <span
                          className={styles.pinnedIndicator}
                          title={t('Pinned')}
                          aria-hidden="true"
                        >
                          <Pin size={12} strokeWidth={2.25} />
                        </span>
                      )}
                      <span className={styles.groupName}>
                        {countryName(group.country, language)}
                      </span>
                      {group.total > 0 && (
                        <span className={styles.groupCount}>{number(group.total)}</span>
                      )}
                      {isHiddenCountry && (
                        <EyeOff size={12} className={styles.hiddenIndicator} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.rowMenuButton}
                      onClick={(event) => openActions(event, menuItems)}
                      aria-label={t('Actions for {name}', {
                        name: countryName(group.country, language),
                      })}
                      aria-haspopup="menu"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  {!isDirectCountry && !isCollapsed && (
                    <div className={styles.groupChildren}>
                      {childRows.map((row) => renderRow(row, { nested: true }))}
                    </div>
                  )}
                </div>
              );
            })}

            {hasSearch && displayedCategoryCount === 0 && (
              <div className={styles.emptySearch}>
                <SearchX size={20} aria-hidden="true" />
                <strong>{t('No categories found')}</strong>
                <span>
                  {hiddenSearchMatchCount > 0
                    ? t('Matching categories are hidden.')
                    : t('Try a different search term.')}
                </span>
              </div>
            )}

            {!hasSearch && rows.length === 0 && (
              <div className={styles.emptySearch}>
                <SearchX size={20} aria-hidden="true" />
                <strong>{t('No categories available')}</strong>
                <span>{t('The provider did not return any categories.')}</span>
              </div>
            )}

            {!hasSearch && hiddenCount > 0 && (
              <button
                type="button"
                className={styles.hiddenToggle}
                onClick={() => setShowHidden((v) => !v)}
              >
                {showHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>
                  {showHidden ? t('Hide') : t('Show')} {number(hiddenCount)} {t('hidden')}
                </span>
              </button>
            )}
          </>
        )}
      </WorkspaceSidebar>
    </>
  );
}
