import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  credentialDelete: vi.fn(),
  credentialLoad: vi.fn(),
  credentialStore: vi.fn(),
  m3uCacheDelete: vi.fn(),
  m3uCacheLoad: vi.fn(),
  m3uCacheStore: vi.fn(),
  m3uFetch: vi.fn(),
  m3uReadFile: vi.fn(),
  sourceSecretDelete: vi.fn(),
  sourceSecretLoad: vi.fn(),
  sourceSecretStore: vi.fn(),
}));

vi.mock('@/platform/tauri', () => ({ tauriApi: native }));

import {
  deleteM3uCache,
  deleteM3uConnection,
  fetchRemoteM3u,
  loadM3uCache,
  loadM3uConnection,
  readLocalM3u,
  storeM3uCache,
  storeM3uConnection,
} from '@/modules/sources/services/m3uRepository';
import {
  deleteXtreamCredentials,
  loadXtreamCredentials,
  storeXtreamCredentials,
} from '@/modules/sources/services/xtreamRepository';
import {
  deleteProviderPassword,
  loadProviderPassword,
  storeProviderPassword,
} from '@/modules/sources/services/credentialVault';
import {
  deleteTmdbApiKey,
  loadTmdbApiKey,
  storeTmdbApiKey,
} from '@/modules/metadata/services/tmdbCredentialVault';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  vi.clearAllMocks();
  native.sourceSecretLoad.mockResolvedValue(null);
  native.m3uCacheLoad.mockResolvedValue(null);
  native.credentialLoad.mockResolvedValue(null);
});

describe('native credential and repository boundaries', () => {
  it('routes M3U operations through typed native IPC', async () => {
    const document = { content: '#EXTM3U', baseUrl: 'https://list.test' };
    native.sourceSecretLoad.mockResolvedValue(
      JSON.stringify({
        location: 'https://list.test',
        headers: { Referer: 'ok', invalid: 42 },
      }),
    );
    native.m3uCacheLoad.mockResolvedValue(document);
    native.m3uFetch.mockResolvedValue(document);
    native.m3uReadFile.mockResolvedValue({ ...document, fileName: 'playlist.m3u' });

    await storeM3uConnection('m3u-1', { location: 'https://list.test' });
    await expect(loadM3uConnection('m3u-1')).resolves.toMatchObject({
      location: 'https://list.test',
    });
    await fetchRemoteM3u({ location: 'https://list.test' }, 'm3u-1');
    await readLocalM3u('C:\\playlist.m3u');
    await storeM3uCache('m3u-1', document);
    await loadM3uCache('m3u-1');
    await deleteM3uCache('m3u-1');
    await deleteM3uConnection('m3u-1');

    expect(native.sourceSecretStore).toHaveBeenCalledWith(
      'm3u-1',
      JSON.stringify({ location: 'https://list.test' }),
    );
    expect(native.m3uFetch).toHaveBeenCalledWith({
      url: 'https://list.test',
      headers: undefined,
      cacheKey: 'm3u-1',
    });
    expect(native.m3uReadFile).toHaveBeenCalledWith('C:\\playlist.m3u');
    expect(native.m3uCacheStore).toHaveBeenCalledWith('m3u-1', document);
  });

  it('routes provider credentials and password storage through native IPC', async () => {
    const credentials = {
      sourceId: 'xtream-1',
      url: 'https://provider.test',
      username: 'alice',
      password: 'secret',
    };
    native.sourceSecretLoad.mockResolvedValue(JSON.stringify(credentials));
    native.credentialLoad.mockResolvedValue('secret');

    await storeXtreamCredentials('xtream-1', credentials);
    await expect(loadXtreamCredentials('xtream-1')).resolves.toMatchObject(credentials);
    await deleteXtreamCredentials('xtream-1');
    await storeProviderPassword('secret');
    await expect(loadProviderPassword()).resolves.toBe('secret');
    await deleteProviderPassword();

    expect(native.sourceSecretStore).toHaveBeenCalledWith('xtream-1', JSON.stringify(credentials));
    expect(native.sourceSecretDelete).toHaveBeenCalledWith('xtream-1');
    expect(native.credentialStore).toHaveBeenCalledWith('secret');
    expect(native.credentialDelete).toHaveBeenCalledTimes(1);
  });

  it('fails closed for malformed native secret documents', async () => {
    native.sourceSecretLoad.mockResolvedValue('{broken');
    await expect(loadM3uConnection('m3u-bad')).resolves.toBeNull();
    native.sourceSecretLoad.mockResolvedValue(
      JSON.stringify({ username: 'alice', password: 'secret' }),
    );
    await expect(loadXtreamCredentials('xtream-bad')).resolves.toBeNull();
    native.sourceSecretLoad.mockResolvedValue(
      JSON.stringify({ url: {}, username: 42, password: 'secret' }),
    );
    await expect(loadXtreamCredentials('xtream-bad')).resolves.toBeNull();
  });

  it('binds restored provider credentials to the requested vault source', async () => {
    native.sourceSecretLoad.mockResolvedValue(
      JSON.stringify({
        sourceId: 'xtream-other',
        url: 'https://provider.test',
        username: 'alice',
        password: 'secret',
      }),
    );

    await expect(loadXtreamCredentials('xtream-requested')).resolves.toMatchObject({
      sourceId: 'xtream-requested',
      url: 'https://provider.test',
      username: 'alice',
    });
  });

  it('keeps the TMDB API key in the native source-secret vault', async () => {
    native.sourceSecretLoad.mockResolvedValue('native-tmdb-key');
    useSettingsStore.getState().updateSetting('tmdbApiKey', 'legacy-key');

    await storeTmdbApiKey('  native-tmdb-key  ');
    await expect(loadTmdbApiKey()).resolves.toBe('native-tmdb-key');
    await deleteTmdbApiKey();

    expect(native.sourceSecretStore).toHaveBeenCalledWith('tmdb-api-key', 'native-tmdb-key');
    expect(native.sourceSecretDelete).toHaveBeenCalledWith('tmdb-api-key');
    expect(useSettingsStore.getState().tmdbApiKey).toBe('');
  });
});
