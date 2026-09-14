import type { M3uEntry, M3uMediaType } from '@/modules/sources/public/data/m3uClient';
import type { M3uHealthStatuses } from './M3uStreamHealthChecker';

export type M3uTableSort = 'default' | 'name-asc' | 'name-desc' | 'chno' | 'type';
export type M3uTableHealthFilter =
  'all' | 'online' | 'offline' | 'unauthorized' | 'timeout' | 'untested';

export interface M3uTableFilters {
  searchQuery: string;
  selectedGroup: string | null;
  mediaTypeFilter: 'all' | M3uMediaType;
  healthFilter: M3uTableHealthFilter;
  sortBy: M3uTableSort;
}

export const M3U_TABLE_FILTER_STORAGE_KEY = 'movena-m3u-editor-filters-v1';
export const DEFAULT_M3U_TABLE_FILTERS: M3uTableFilters = {
  searchQuery: '',
  selectedGroup: null,
  mediaTypeFilter: 'all',
  healthFilter: 'all',
  sortBy: 'default',
};

export function readM3uTableFilters(
  storage: Pick<Storage, 'getItem'> = localStorage,
): M3uTableFilters {
  try {
    const value = JSON.parse(storage.getItem(M3U_TABLE_FILTER_STORAGE_KEY) || '{}') as Record<
      string,
      unknown
    >;
    return {
      searchQuery: '',
      selectedGroup: typeof value.selectedGroup === 'string' ? value.selectedGroup : null,
      mediaTypeFilter:
        value.mediaTypeFilter === 'live' ||
        value.mediaTypeFilter === 'vod' ||
        value.mediaTypeFilter === 'series'
          ? value.mediaTypeFilter
          : 'all',
      healthFilter:
        value.healthFilter === 'online' ||
        value.healthFilter === 'offline' ||
        value.healthFilter === 'unauthorized' ||
        value.healthFilter === 'timeout' ||
        value.healthFilter === 'untested'
          ? value.healthFilter
          : 'all',
      sortBy:
        value.sortBy === 'name-asc' ||
        value.sortBy === 'name-desc' ||
        value.sortBy === 'chno' ||
        value.sortBy === 'type'
          ? value.sortBy
          : 'default',
    };
  } catch {
    return { ...DEFAULT_M3U_TABLE_FILTERS };
  }
}

export function collectM3uGroupStats(
  entries: readonly M3uEntry[],
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const group = entry.groupTitle || 'General';
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function filterAndSortM3uEntries(
  entries: readonly M3uEntry[],
  healthStatuses: M3uHealthStatuses,
  filters: M3uTableFilters,
): M3uEntry[] {
  let result = [...entries];
  if (filters.selectedGroup !== null) {
    result = result.filter((entry) => (entry.groupTitle || 'General') === filters.selectedGroup);
  }
  if (filters.mediaTypeFilter !== 'all') {
    result = result.filter((entry) => entry.type === filters.mediaTypeFilter);
  }
  if (filters.healthFilter !== 'all') {
    result = result.filter((entry) => {
      const health = healthStatuses[entry.id];
      if (filters.healthFilter === 'untested') return !health;
      const status = health === 'checking' ? 'checking' : health?.status;
      return status === filters.healthFilter;
    });
  }
  const query = filters.searchQuery.trim().toLocaleLowerCase();
  if (query) {
    result = result.filter((entry) =>
      [entry.title, entry.url, entry.tvgId, entry.groupTitle].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      ),
    );
  }
  const compare =
    filters.sortBy === 'name-asc'
      ? (left: M3uEntry, right: M3uEntry) => left.title.localeCompare(right.title)
      : filters.sortBy === 'name-desc'
        ? (left: M3uEntry, right: M3uEntry) => right.title.localeCompare(left.title)
        : filters.sortBy === 'chno'
          ? (left: M3uEntry, right: M3uEntry) =>
              (Number(left.channelNumber) || Infinity) - (Number(right.channelNumber) || Infinity)
          : filters.sortBy === 'type'
            ? (left: M3uEntry, right: M3uEntry) => (left.type || '').localeCompare(right.type || '')
            : null;
  return compare ? result.sort(compare) : result;
}
