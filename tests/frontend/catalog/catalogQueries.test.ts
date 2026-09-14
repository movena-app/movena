import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseM3u } from '@/modules/sources/data/m3uClient';
import { catalogQueryOptions, selectFoldedLiveCatalog } from '@/modules/catalog/data/useCatalog';
import { categoriesQueryOptions } from '@/modules/catalog/data/useCategories';
import type { EnabledSourcesSnapshot } from '@/modules/sources/hooks/useEnabledSources';

const xc = vi.hoisted(() => ({
  getLiveCategories: vi.fn(),
  getLiveStreams: vi.fn(),
  getSeries: vi.fn(),
  getSeriesCategories: vi.fn(),
  getVodCategories: vi.fn(),
  getVodStreams: vi.fn(),
  getStreamUrl: vi.fn(
    (credentials: { url: string }, type: string, id: string | number, extension?: string) =>
      `${credentials.url}/${type}/${id}.${extension || 'mp4'}`,
  ),
}));

vi.mock('@/modules/sources/data/xtreamClient', () => xc);

const credentials = {
  sourceId: 'xtream-one',
  url: 'https://provider.test',
  username: 'alice',
  password: 'secret',
};

const xtreamProfile = {
  id: 'xtream-one',
  kind: 'xtream',
  name: 'Provider',
  locationLabel: 'provider.test',
  username: 'alice',
  userInfo: { auth: 1 },
  serverInfo: {},
  createdAt: 1,
  updatedAt: 1,
};

function sources(overrides: Partial<EnabledSourcesSnapshot> = {}): EnabledSourcesSnapshot {
  const xtreamSource = {
    id: 'xtream-one',
    profile: xtreamProfile,
    runtime: { credentials, status: 'ready', error: null, revision: 1 },
    credentials,
    queryScope: 'xtream-scope',
    isAvailable: true,
  };
  return {
    enabledSourceIds: ['xtream-one'],
    xtreamEnabled: true,
    xtreamAvailable: true,
    xtreamSources: [xtreamSource],
    availableXtreamSources: [xtreamSource],
    m3uSources: [],
    availableM3uSources: [],
    isAvailable: true,
    isLoading: false,
    errors: [],
    queryScope: 'sources-scope',
    ...overrides,
  } as EnabledSourcesSnapshot;
}

async function runQuery<T>(options: { queryFn?: unknown }): Promise<T> {
  const queryFn = options.queryFn as (context: { signal?: AbortSignal }) => Promise<T>;
  return queryFn({ signal: new AbortController().signal });
}

describe('source-scoped catalog and category queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps Xtream and M3U live items without leaking source identity', async () => {
    xc.getLiveStreams.mockResolvedValue([
      {
        stream_id: 42,
        name: 'DE | News HD',
        stream_icon: 'provider-logo',
        category_id: '7',
        epg_channel_id: 'news',
        num: 1,
        stream_type: 'radio',
        direct_source: 'https://provider.test/direct/42',
        tv_archive: 1,
        tv_archive_duration: 7,
      },
    ]);
    const playlist = parseM3u(
      '#EXTM3U\n#EXTINF:-1 tvg-id="m3u-news" group-title="News",Local News\nhttps://m3u.test/news.ts',
      { sourceId: 'm3u-one' },
    );
    const m3uSource = {
      id: 'm3u-one',
      profile: { id: 'm3u-one', name: 'Local', kind: 'm3u' },
      runtime: { playlist, connection: null, status: 'ready', error: null, revision: 1 },
      queryScope: 'm3u-scope',
      isAvailable: true,
    } as any;

    const result = await runQuery<any>(
      catalogQueryOptions(
        'live',
        sources({
          availableM3uSources: [m3uSource],
          m3uSources: [m3uSource],
        }),
      ),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'xtream-one:live:42',
          sourceId: 'xtream-one',
          categoryId: 'xtream-one:category:7',
          radio: true,
        }),
        expect.objectContaining({
          id: expect.stringMatching(/^m3u-/),
          sourceId: 'm3u-one',
          streamUrl: 'https://m3u.test/news.ts',
        }),
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('shares one folded live result between observers of the same catalog', () => {
    const catalog = [
      {
        id: 'one',
        title: 'News HD',
        posterUrl: '',
        type: 'live' as const,
        streamUrl: 'https://one.test',
      },
      {
        id: 'two',
        title: 'News HD',
        posterUrl: '',
        type: 'live' as const,
        streamUrl: 'https://two.test',
      },
    ];

    const first = selectFoldedLiveCatalog(catalog);
    expect(selectFoldedLiveCatalog(catalog)).toBe(first);
  });

  it('keeps successful providers when another enabled provider fails, but errors when none work', async () => {
    const second = {
      id: 'xtream-two',
      profile: { ...xtreamProfile, id: 'xtream-two', name: 'Backup' },
      runtime: {
        credentials: { ...credentials, sourceId: 'xtream-two', url: 'https://backup.test' },
        status: 'ready',
        error: null,
        revision: 1,
      },
      credentials: { ...credentials, sourceId: 'xtream-two', url: 'https://backup.test' },
      queryScope: 'backup',
      isAvailable: true,
    } as any;
    xc.getVodStreams.mockRejectedValueOnce(new Error('primary offline')).mockResolvedValueOnce([
      {
        stream_id: 8,
        name: 'Backup Movie',
        stream_icon: '',
        category_id: '3',
        container_extension: 'mkv',
      },
    ]);

    const result = await runQuery<any>(
      catalogQueryOptions(
        'vod',
        sources({
          xtreamSources: [sources().xtreamSources[0], second],
          availableXtreamSources: [sources().availableXtreamSources[0], second],
        }),
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'xtream-two:vod:8', sourceId: 'xtream-two' });

    xc.getVodStreams.mockRejectedValue(new Error('all offline'));
    await expect(runQuery<any>(catalogQueryOptions('vod', sources()))).rejects.toThrow(
      'all offline',
    );
  });

  it('retains every provider name and technical failure when all catalog sources fail', async () => {
    const backup = {
      id: 'xtream-two',
      profile: { ...xtreamProfile, id: 'xtream-two', name: 'Backup' },
      runtime: {
        credentials: { ...credentials, sourceId: 'xtream-two', url: 'https://backup.test' },
        status: 'ready',
        error: null,
        revision: 1,
      },
      credentials: { ...credentials, sourceId: 'xtream-two', url: 'https://backup.test' },
      queryScope: 'backup',
      isAvailable: true,
    } as any;
    xc.getVodStreams
      .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      runQuery<any>(
        catalogQueryOptions(
          'vod',
          sources({
            xtreamSources: [sources().xtreamSources[0], backup],
            availableXtreamSources: [sources().availableXtreamSources[0], backup],
          }),
        ),
      ),
    ).rejects.toThrow('Provider: HTTP 503 Service Unavailable\nBackup: ECONNREFUSED');
  });

  it('merges provider and playlist categories with source-scoped provider ids', async () => {
    xc.getLiveCategories.mockResolvedValue([
      { category_id: '7', category_name: 'DE | News', parent_id: 0 },
    ]);
    const playlist = parseM3u(
      '#EXTM3U\n#EXTINF:-1 group-title="Local News",One\nhttps://m3u.test/one.ts',
      { sourceId: 'm3u-one' },
    );
    const m3uSource = {
      id: 'm3u-one',
      profile: { id: 'm3u-one', name: 'Local', kind: 'm3u' },
      runtime: { playlist, connection: null, status: 'ready', error: null, revision: 1 },
      queryScope: 'm3u-scope',
      isAvailable: true,
    } as any;

    const result = await runQuery<any>(
      categoriesQueryOptions(
        'live',
        sources({
          availableM3uSources: [m3uSource],
          m3uSources: [m3uSource],
        }),
      ),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        { category_id: 'xtream-one:category:7', category_name: 'DE | News', parent_id: 0 },
        expect.objectContaining({
          category_id: expect.stringMatching(/^m3u-category-/),
          category_name: 'Local News',
        }),
      ]),
    );
  });

  it('fails category loading only when every available provider fails', async () => {
    xc.getSeriesCategories.mockRejectedValue(new Error('series categories offline'));

    await expect(runQuery<any>(categoriesQueryOptions('series', sources()))).rejects.toThrow(
      'series categories offline',
    );

    xc.getSeriesCategories.mockResolvedValue([
      { category_id: '9', category_name: 'Drama', parent_id: 0 },
    ]);
    await expect(runQuery<any>(categoriesQueryOptions('series', sources()))).resolves.toEqual([
      { category_id: 'xtream-one:category:9', category_name: 'Drama', parent_id: 0 },
    ]);
  });
});
