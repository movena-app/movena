import { describe, expect, it } from 'vitest';
import type { M3uEntry } from '@/modules/sources/data/m3uClient';
import {
  collectM3uGroupStats,
  DEFAULT_M3U_TABLE_FILTERS,
  filterAndSortM3uEntries,
  M3U_TABLE_FILTER_STORAGE_KEY,
  readM3uTableFilters,
} from '@/modules/m3u-editor/components/m3uChannelTableModel';

const entry = (id: string, overrides: Partial<M3uEntry> = {}): M3uEntry => ({
  id,
  sourceId: 'm3u-source',
  title: id,
  url: `https://media.test/${id}`,
  type: 'live',
  duration: -1,
  groupTitle: '',
  categoryId: '',
  headers: {},
  ...overrides,
});

describe('M3U channel table model', () => {
  it('recovers safe defaults from corrupt or unrecognized persisted filters', () => {
    expect(readM3uTableFilters({ getItem: () => '{broken' })).toEqual(DEFAULT_M3U_TABLE_FILTERS);
    expect(
      readM3uTableFilters({
        getItem: (key) =>
          key === M3U_TABLE_FILTER_STORAGE_KEY
            ? JSON.stringify({
                selectedGroup: 42,
                mediaTypeFilter: 'radio',
                healthFilter: 'checking',
                sortBy: 'random',
              })
            : null,
      }),
    ).toEqual(DEFAULT_M3U_TABLE_FILTERS);
  });

  it('counts stable alphabetized groups and assigns blank groups to General', () => {
    expect(
      collectM3uGroupStats([
        entry('one', { groupTitle: 'Sports' }),
        entry('two'),
        entry('three', { groupTitle: 'Sports' }),
      ]),
    ).toEqual([
      { name: 'General', count: 1 },
      { name: 'Sports', count: 2 },
    ]);
  });

  it('combines group, media, health, and metadata search filters', () => {
    const entries = [
      entry('news', { title: 'World News', groupTitle: 'News', tvgId: 'world.tv' }),
      entry('film', { title: 'Feature', type: 'vod', groupTitle: 'Movies' }),
      entry('local', { title: 'Local News', groupTitle: 'News' }),
    ];
    expect(
      filterAndSortM3uEntries(
        entries,
        {
          news: { status: 'online', httpStatus: 200, latencyMs: 20, checkedAt: 1 },
          local: 'checking',
        },
        {
          ...DEFAULT_M3U_TABLE_FILTERS,
          selectedGroup: 'News',
          mediaTypeFilter: 'live',
          healthFilter: 'online',
          searchQuery: 'WORLD.TV',
        },
      ).map(({ id }) => id),
    ).toEqual(['news']);
  });

  it('treats absent health results as untested and sorts channel numbers last when missing', () => {
    const result = filterAndSortM3uEntries(
      [
        entry('missing'),
        entry('ten', { channelNumber: '10' }),
        entry('two', { channelNumber: '2' }),
      ],
      {},
      { ...DEFAULT_M3U_TABLE_FILTERS, healthFilter: 'untested', sortBy: 'chno' },
    );
    expect(result.map(({ id }) => id)).toEqual(['two', 'ten', 'missing']);
  });

  it('does not mutate the source array while sorting', () => {
    const entries = [entry('beta'), entry('alpha')];
    expect(
      filterAndSortM3uEntries(
        entries,
        {},
        { ...DEFAULT_M3U_TABLE_FILTERS, sortBy: 'name-asc' },
      ).map(({ id }) => id),
    ).toEqual(['alpha', 'beta']);
    expect(entries.map(({ id }) => id)).toEqual(['beta', 'alpha']);
  });
});
