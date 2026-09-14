import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseM3u } from '@/modules/sources/data/m3uClient';
import { prefetchNavigationData } from '@/app/bootstrap/prefetch';
import { queryClient } from '@/shared/query/queryClient';
import { queryKeys } from '@/modules/sources/model/queryKeys';
import type { EnabledSourcesSnapshot } from '@/modules/sources/hooks/useEnabledSources';

const preloadRouteModule = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/app/router/routeModules', () => ({ preloadRouteModule }));

const sourceId = 'm3u-prefetch-source';
const queryScope = 'sources-prefetch';

function m3uSnapshot(): EnabledSourcesSnapshot {
  const playlist = parseM3u(
    '#EXTM3U\n#EXTINF:-1 group-title="News",Example TV\nhttps://stream.test/live.m3u8',
    { sourceId },
  );
  const profile = {
    id: sourceId,
    kind: 'm3u' as const,
    name: 'Prefetch source',
    locationType: 'remote' as const,
    locationLabel: 'stream.test',
    refreshIntervalMinutes: 360,
    lastRefreshAt: Date.now(),
    entryCount: 1,
    liveCount: 1,
    vodCount: 0,
    seriesCount: 0,
    hasEpg: false,
  };
  const runtime = {
    connection: { location: 'https://stream.test/list.m3u' },
    playlist,
    status: 'ready' as const,
    error: null,
    revision: 1,
  };
  const source = {
    id: sourceId,
    profile,
    runtime,
    queryScope: 'playlist-prefetch-1',
    isAvailable: true,
  };
  return {
    enabledSourceIds: [sourceId],
    xtreamEnabled: false,
    xtreamAvailable: false,
    xtreamSources: [],
    availableXtreamSources: [],
    m3uSources: [source],
    availableM3uSources: [source],
    isAvailable: true,
    isLoading: false,
    errors: [],
    queryScope,
  };
}

beforeEach(() => queryClient.clear());

describe('navigation prefetching', () => {
  it('warms the live catalog and categories without eagerly fetching XMLTV', async () => {
    await prefetchNavigationData('/live', m3uSnapshot());

    expect(preloadRouteModule).toHaveBeenCalledWith('/live');
    expect(queryClient.getQueryData(queryKeys.catalog('live', queryScope))).toEqual([
      expect.objectContaining({ title: 'Example TV', sourceId }),
    ]);
    expect(queryClient.getQueryData(queryKeys.categories('live', queryScope))).toEqual([
      expect.objectContaining({ category_name: 'News' }),
    ]);
    expect(queryClient.getQueryCache().findAll({ queryKey: ['xmltv_guides'] })).toHaveLength(0);
  });
});
