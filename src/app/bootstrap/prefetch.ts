import type { CatalogType } from '@/modules/settings/store/useSettingsStore';
import type { EnabledSourcesSnapshot } from '@/modules/sources/hooks/useEnabledSources';
import { catalogQueryOptions, isCatalogAvailable } from '@/modules/catalog/data/useCatalog';
import { categoriesQueryOptions } from '@/modules/catalog/data/useCategories';
import { queryClient } from '@/shared/query/queryClient';
import { preloadRouteModule } from '../router/routeModules';

const ROUTE_CATALOGS: Record<string, readonly CatalogType[]> = {
  '/': ['live', 'vod', 'series'],
  '/live': ['live'],
  '/epg': ['live'],
  '/movies': ['vod'],
  '/series': ['series'],
  '/search': ['live', 'vod', 'series'],
};

const ROUTES_WITH_CATEGORIES = new Set(['/', '/live', '/epg', '/movies', '/series']);

/** Warm data for a likely navigation without downloading the large XMLTV guide speculatively. */
export async function prefetchNavigationData(
  path: string,
  sources: EnabledSourcesSnapshot,
): Promise<void> {
  const types = (ROUTE_CATALOGS[path] ?? []).filter((type) => isCatalogAvailable(type, sources));
  await Promise.all([
    preloadRouteModule(path),
    ...types.flatMap((type) => [
      queryClient.prefetchQuery(catalogQueryOptions(type, sources)),
      ...(ROUTES_WITH_CATEGORIES.has(path)
        ? [queryClient.prefetchQuery(categoriesQueryOptions(type, sources))]
        : []),
    ]),
  ]);
}
