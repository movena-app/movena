import { useMemo } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  getVodCategories,
  getSeriesCategories,
  getLiveCategories,
} from '@/modules/sources/public/data/xtreamClient';
import {
  useSettingsStore,
  type CatalogType,
} from '@/modules/settings/public/store/useSettingsStore';
import { parseCategoryName } from '@/shared/lib/categoryName';
import { useCatalogByType } from './useCatalog';
import { queryKeys } from '@/modules/sources/public/model/queryKeys';
import {
  useEnabledSources,
  type EnabledSourcesSnapshot,
} from '@/modules/sources/public/hooks/useEnabledSources';
import { xtreamCategoryId } from '@/modules/sources/public/lib/sourceIdentity';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';

export interface SourceCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

/** The provider's category list for one catalogue, fetched once and shared. */
export function categoriesQueryOptions(type: CatalogType, sources: EnabledSourcesSnapshot) {
  return queryOptions({
    queryKey: queryKeys.categories(type, sources.queryScope),
    queryFn: async ({ signal }): Promise<SourceCategory[]> => {
      const groups = new Map<string, SourceCategory>();
      for (const source of sources.availableM3uSources) {
        for (const entry of source.runtime?.playlist?.entries ?? []) {
          if (entry.type !== type) continue;
          groups.set(entry.categoryId, {
            category_id: entry.categoryId,
            category_name: entry.groupTitle,
            parent_id: 0,
          });
        }
      }
      const results = await Promise.allSettled(
        sources.availableXtreamSources.map(async (source) => {
          let res;
          if (type === 'vod') res = await getVodCategories(source.credentials!, signal);
          else if (type === 'series') res = await getSeriesCategories(source.credentials!, signal);
          else res = await getLiveCategories(source.credentials!, signal);
          return (Array.isArray(res) ? res : []).map((category) => ({
            ...category,
            category_id: xtreamCategoryId(source.id, category.category_id)!,
            category_name: category.category_name,
          }));
        }),
      );
      const providerCategories = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      );
      const providerFailures = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [
              `${sources.availableXtreamSources[index]?.profile.name ?? `Source ${index + 1}`}: ${getErrorMessage(result.reason, 'Category request failed without an error message.')}`,
            ]
          : [],
      );
      const failedProviders = providerFailures.length;
      if (groups.size === 0 && results.length > 0 && failedProviders === results.length) {
        throw new Error(providerFailures.join('\n'));
      }
      if (failedProviders > 0 && (providerCategories.length > 0 || groups.size > 0)) {
        notify.warning(
          'Some Categories Unavailable',
          `${failedProviders} enabled source${failedProviders === 1 ? '' : 's'} could not load categories. Available categories are still shown.\n${providerFailures.join('\n')}`,
          undefined,
          undefined,
          'connection',
        );
      }
      return [...providerCategories, ...groups.values()];
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 12,
    retry: false,
  });
}

export function useCategories(type: CatalogType) {
  const sources = useEnabledSources();

  return useQuery({
    ...categoriesQueryOptions(type, sources),
    enabled: sources.isAvailable,
  });
}

/**
 * Every category id the user has hidden — directly, or by hiding the whole
 * country it belongs to.
 *
 * Shared between the sidebar and the catalogue pages on purpose. Hiding used to
 * be a sidebar-only affair, so a hidden country vanished from the list while its
 * channels carried on appearing under "All". The rule lives in one place now, so
 * the list and what it filters cannot disagree.
 */
export function useHiddenCategoryIds(type: CatalogType): Set<string> {
  const { data: categories = [] } = useCategories(type);
  const categoryPrefs = useSettingsStore((s) => s.categoryPrefs);

  return useMemo(() => {
    const hidden = categoryPrefs?.hidden?.[type] ?? [];
    const hiddenCountries = categoryPrefs?.hiddenCountries?.[type] ?? [];
    const ids = new Set(hidden);
    if (hiddenCountries.length > 0) {
      for (const cat of categories) {
        const { country } = parseCategoryName(cat.category_name || '');
        if (hiddenCountries.includes(country ?? 'other')) {
          ids.add(String(cat.category_id));
        }
      }
    }
    return ids;
  }, [categories, categoryPrefs, type]);
}

/**
 * A catalogue with the user's hidden categories already removed.
 *
 * For browsing surfaces such as the home screen, which have no category
 * selection and should simply never surface hidden material. The catalogue
 * pages deliberately keep the unfiltered list: there, picking a hidden category
 * outright still has to show it, or "show hidden" would lead nowhere.
 */
export function useVisibleCatalog(type: CatalogType) {
  const query = useCatalogByType(type);
  const { data: items = [] } = query;
  const hiddenIds = useHiddenCategoryIds(type);

  const data = useMemo(
    () => items.filter((item) => !item.categoryId || !hiddenIds.has(item.categoryId)),
    [items, hiddenIds],
  );

  return { ...query, data };
}
