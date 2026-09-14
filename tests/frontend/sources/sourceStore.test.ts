// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  deleteM3uCache: vi.fn(),
  deleteM3uConnection: vi.fn(),
  fetchRemoteM3u: vi.fn(),
  loadM3uCache: vi.fn(),
  loadM3uConnection: vi.fn(),
  readLocalM3u: vi.fn(),
  storeM3uCache: vi.fn(),
  storeM3uConnection: vi.fn(),
  writeLocalM3u: vi.fn(),
}));

vi.mock('@/modules/sources/services/m3uRepository', () => repository);

import {
  ACTIVE_SOURCE_STORAGE_KEY,
  ENABLED_SOURCE_IDS_STORAGE_KEY,
  SOURCE_PROFILES_STORAGE_KEY,
  useSourceStore,
} from '@/modules/sources/store/useSourceStore';
import { queryClient } from '@/shared/query/queryClient';

const document = {
  content:
    '#EXTM3U x-tvg-url="https://guide.test/epg.xml"\n#EXTINF:-1 tvg-id="one" group-title="News",One\nhttps://stream.test/one.m3u8',
  baseUrl: 'https://list.test/main.m3u',
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  queryClient.clear();
  repository.fetchRemoteM3u.mockResolvedValue(document);
  repository.loadM3uCache.mockResolvedValue(null);
  repository.loadM3uConnection.mockResolvedValue(null);
  repository.storeM3uCache.mockResolvedValue(undefined);
  repository.storeM3uConnection.mockResolvedValue(undefined);
  repository.writeLocalM3u.mockResolvedValue(undefined);
  repository.deleteM3uCache.mockResolvedValue(undefined);
  repository.deleteM3uConnection.mockResolvedValue(undefined);
  useSourceStore.setState({
    profiles: [],
    runtimes: {},
    enabledSourceIds: [],
    isInitializing: false,
    initializationError: null,
  });
});
describe('M3U source state and secret boundary', () => {
  it('allows plain HTTP playlists, since most IPTV providers only offer HTTP', async () => {
    const profile = await useSourceStore.getState().addRemoteSource({
      name: 'Legacy provider',
      url: 'http://list.test/main.m3u',
    });
    expect(repository.storeM3uConnection).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({
        location: 'http://list.test/main.m3u',
      }),
    );
  });

  it('passes an opaque source cache key to native downloads and invalidates source queries', async () => {
    queryClient.setQueryData(['catalog', 'live', 'previous-scope'], []);

    const profile = await useSourceStore.getState().addRemoteSource({
      name: 'Cached provider',
      url: 'https://list.test/main.m3u',
    });

    expect(repository.fetchRemoteM3u).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'https://list.test/main.m3u' }),
      profile.id,
    );
    expect(queryClient.getQueryState(['catalog', 'live', 'previous-scope'])?.isInvalidated).toBe(
      true,
    );
  });

  it('persists only public source metadata and enables a validated remote playlist alongside existing sources', async () => {
    const profile = await useSourceStore.getState().addRemoteSource({
      name: 'Private Provider',
      url: 'https://list.test/get.php?username=alice&password=secret',
      userAgent: 'Provider App',
    });

    expect(profile.entryCount).toBe(1);
    expect(profile.hasEpg).toBe(true);
    expect(useSourceStore.getState().enabledSourceIds).toEqual([profile.id]);
    expect(repository.storeM3uConnection).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({
        location: 'https://list.test/get.php?username=alice&password=secret',
        headers: { 'User-Agent': 'Provider App' },
      }),
    );
    const persisted = localStorage.getItem(SOURCE_PROFILES_STORAGE_KEY) ?? '';
    expect(persisted).not.toContain('alice');
    expect(persisted).not.toContain('secret');
    expect(persisted).not.toContain('get.php');
    expect(JSON.parse(localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY) ?? '[]')).toEqual([
      profile.id,
    ]);
  });

  it('restores a cached playlist and sanitizes malformed public profiles', async () => {
    localStorage.setItem(
      SOURCE_PROFILES_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'm3u-12345678',
          kind: 'm3u',
          name: 'Cached',
          locationType: 'remote',
          locationLabel: 'list.test',
          refreshIntervalMinutes: 0,
          lastRefreshAt: -10,
          entryCount: 1,
          liveCount: 1,
          vodCount: 0,
          seriesCount: 0,
          hasEpg: false,
        },
        { id: '../escape', kind: 'm3u', name: 'Bad', locationType: 'local' },
      ]),
    );
    localStorage.setItem(ACTIVE_SOURCE_STORAGE_KEY, 'm3u-12345678');
    repository.loadM3uConnection.mockResolvedValue({ location: 'https://list.test/main.m3u' });
    repository.loadM3uCache.mockResolvedValue(document);

    await useSourceStore.getState().initialize();

    const state = useSourceStore.getState();
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({ refreshIntervalMinutes: 15, lastRefreshAt: 0 });
    expect(state.runtimes['m3u-12345678']).toMatchObject({ status: 'ready', revision: 1 });
    expect(state.enabledSourceIds).toEqual(['m3u-12345678']);
    expect(localStorage.getItem(ACTIVE_SOURCE_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY) ?? '[]')).toEqual([
      'm3u-12345678',
    ]);
  });

  it('enables multiple playlists independently and preserves an intentionally empty selection', async () => {
    const first = await useSourceStore
      .getState()
      .addRemoteSource({ name: 'First', url: 'https://list.test/first.m3u' });
    const second = await useSourceStore
      .getState()
      .addRemoteSource({ name: 'Second', url: 'https://list.test/second.m3u' });
    expect(useSourceStore.getState().enabledSourceIds).toEqual([first.id, second.id]);

    useSourceStore.getState().setSourceEnabled(first.id, false);
    useSourceStore.getState().setSourceEnabled(second.id, false);
    expect(useSourceStore.getState().enabledSourceIds).toEqual([]);
    expect(localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY)).toBe('[]');
  });

  it('keeps the last valid cache available when a refresh fails', async () => {
    const profile = await useSourceStore
      .getState()
      .addRemoteSource({ name: 'Stable', url: 'https://list.test/main.m3u' });
    repository.fetchRemoteM3u.mockRejectedValueOnce(new Error('offline'));

    await expect(useSourceStore.getState().refreshSource(profile.id)).rejects.toThrow('offline');
    expect(useSourceStore.getState().runtimes[profile.id]).toMatchObject({
      status: 'ready',
      error: 'offline',
    });
    expect(useSourceStore.getState().runtimes[profile.id]!.playlist?.entries).toHaveLength(1);
  });

  it('edits a remote playlist in place so saved source identities remain stable', async () => {
    const profile = await useSourceStore
      .getState()
      .addRemoteSource({ name: 'Before', url: 'https://list.test/old.m3u' });
    const updated = await useSourceStore.getState().updateRemoteSource(profile.id, {
      name: 'After',
      url: 'https://list.test/new.m3u',
      epgUrl: 'https://guide.test/new.xml',
      userAgent: 'Movena Test',
      refreshIntervalMinutes: 720,
    });

    expect(updated).toMatchObject({
      id: profile.id,
      name: 'After',
      refreshIntervalMinutes: 720,
      hasEpg: true,
    });
    expect(repository.storeM3uConnection).toHaveBeenLastCalledWith(profile.id, {
      location: 'https://list.test/new.m3u',
      epgUrl: 'https://guide.test/new.xml',
      headers: { 'User-Agent': 'Movena Test' },
    });
    expect(useSourceStore.getState().runtimes[profile.id]!.revision).toBe(2);
  });

  it('edits local playlist metadata without discarding its validated cache', async () => {
    const profile = await useSourceStore.getState().addLocalSource({
      name: 'Local Before',
      fileName: 'channels.m3u',
      content: document.content,
    });
    const playlist = useSourceStore.getState().runtimes[profile.id]!.playlist;

    const updated = await useSourceStore.getState().updateLocalSource(profile.id, {
      name: 'Local After',
      epgUrl: 'https://guide.test/local.xml',
    });

    expect(updated).toMatchObject({ id: profile.id, name: 'Local After', hasEpg: true });
    expect(useSourceStore.getState().runtimes[profile.id]!.playlist).toBe(playlist);
    expect(repository.storeM3uConnection).toHaveBeenLastCalledWith(profile.id, {
      location: 'channels.m3u',
      epgUrl: 'https://guide.test/local.xml',
    });
  });

  it('saves an edited playlist document directly into cache and runtime state', async () => {
    const profile = await useSourceStore.getState().addLocalSource({
      name: 'Editable Playlist',
      fileName: 'channels.m3u',
      content: document.content,
    });

    const newContent =
      '#EXTM3U\n#EXTINF:-1 group-title="Sports",Live Sports\nhttps://stream.test/sports.m3u8\n#EXTINF:-1 group-title="News",Live News\nhttps://stream.test/news.m3u8';
    const updated = await useSourceStore
      .getState()
      .saveEditedSource(profile.id, newContent, 'Custom Playlist');

    expect(updated.name).toBe('Custom Playlist');
    expect(updated.entryCount).toBe(2);
    expect(updated.liveCount).toBe(2);
    expect(updated.hasLocalEdits).toBe(true);
    expect(updated.editorRefreshPolicy).toBe('preserve-edits');
    expect(repository.storeM3uCache).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({
        content: newContent,
      }),
    );
    const runtime = useSourceStore.getState().runtimes[profile.id]!;
    expect(runtime.playlist?.entries).toHaveLength(2);
    expect(runtime.playlist?.entries[0]!.title).toBe('Live Sports');
    await expect(useSourceStore.getState().refreshSource(profile.id)).rejects.toThrow(
      'edited channels',
    );
    useSourceStore.getState().setEditorRefreshPolicy(profile.id, 'replace-edits');
    expect(
      useSourceStore.getState().profiles.find((candidate) => candidate.id === profile.id)
        ?.editorRefreshPolicy,
    ).toBe('replace-edits');
  });

  it('writes an edited local source back only after the source opts in', async () => {
    const profile = await useSourceStore.getState().addLocalSource({
      name: 'Local file',
      fileName: 'channels.m3u',
      content: document.content,
      path: 'C:\\TV\\channels.m3u',
    });
    const content = '#EXTM3U\n#EXTINF:-1,Updated\nhttps://stream.test/updated.m3u8';
    await useSourceStore.getState().saveEditedSource(profile.id, content);
    expect(repository.writeLocalM3u).not.toHaveBeenCalled();

    useSourceStore.getState().setEditorWriteBack(profile.id, true);
    await useSourceStore.getState().saveEditedSource(profile.id, content);
    expect(repository.writeLocalM3u).toHaveBeenCalledWith('C:\\TV\\channels.m3u', content);
  });

  it('removes newly stored native records when public source persistence fails', async () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const storageSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === SOURCE_PROFILES_STORAGE_KEY)
        throw new DOMException('quota', 'QuotaExceededError');
      return originalSetItem(key, value);
    });

    await expect(
      useSourceStore.getState().addRemoteSource({
        name: 'Rollback',
        url: 'https://list.test/rollback.m3u',
      }),
    ).rejects.toThrow();

    expect(repository.deleteM3uConnection).toHaveBeenCalledOnce();
    expect(repository.deleteM3uCache).toHaveBeenCalledOnce();
    expect(useSourceStore.getState().profiles).toEqual([]);
    storageSpy.mockRestore();
  });
});
