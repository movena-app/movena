import { beforeEach, describe, expect, it, vi } from 'vitest';

const documents = vi.hoisted(() => new Map<string, { content: string; baseUrl: string }>());
vi.mock('@/modules/sources/services/m3uRepository', () => ({
  deleteM3uCache: vi.fn(async (key: string) => {
    documents.delete(key);
  }),
  loadM3uCache: vi.fn(async (key: string) => documents.get(key) ?? null),
  storeM3uCache: vi.fn(async (key: string, document: { content: string; baseUrl: string }) => {
    documents.set(key, document);
  }),
}));

import {
  clearM3uVersions,
  deleteM3uVersion,
  listM3uVersions,
  saveM3uVersion,
} from '@/modules/m3u-editor/services/m3uVersionHistory';

beforeEach(() => {
  vi.stubGlobal('indexedDB', undefined);
  documents.clear();
});

describe('M3U version history', () => {
  it('keeps source histories isolated and bounded', async () => {
    for (let index = 0; index < 12; index += 1) {
      await saveM3uVersion({
        sourceId: 'one',
        content: `version-${index}`,
        entryCount: index,
        label: 'Checkpoint',
      });
    }
    await saveM3uVersion({ sourceId: 'two', content: 'other', entryCount: 1, label: 'Other' });

    const first = await listM3uVersions('one');
    expect(first).toHaveLength(10);
    expect(first.every((version) => version.sourceId === 'one')).toBe(true);
    expect(await listM3uVersions('two')).toHaveLength(1);
  });

  it('deletes individual versions and clears a source', async () => {
    const version = await saveM3uVersion({
      sourceId: 'one',
      content: 'playlist',
      entryCount: 1,
      label: 'Checkpoint',
    });
    await deleteM3uVersion(version.id);
    expect(await listM3uVersions('one')).toEqual([]);

    await saveM3uVersion({
      sourceId: 'one',
      content: 'playlist',
      entryCount: 1,
      label: 'Checkpoint',
    });
    await clearM3uVersions('one');
    expect(await listM3uVersions('one')).toEqual([]);
  });
});
