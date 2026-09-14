// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const vault = vi.hoisted(() => ({
  loadProviderPassword: vi.fn(),
  deleteProviderPassword: vi.fn(),
}));
const repository = vi.hoisted(() => ({
  storeXtreamCredentials: vi.fn(),
  loadXtreamCredentials: vi.fn(),
  deleteXtreamCredentials: vi.fn(),
}));
const xc = vi.hoisted(() => ({ authenticateXtream: vi.fn() }));

vi.mock('@/modules/sources/services/credentialVault', () => vault);
vi.mock('@/modules/sources/services/xtreamRepository', () => repository);
vi.mock('@/modules/sources/data/xtreamClient', () => xc);

import {
  AUTH_PROFILE_STORAGE_KEY,
  LEGACY_AUTH_STORAGE_KEY,
  XTREAM_PROFILES_STORAGE_KEY,
  selectIsAuthenticated,
  useAuthStore,
} from '@/modules/sources/store/useAuthStore';
import type { XtreamServerInfo, XtreamUserInfo } from '@/modules/sources/model/xtream';
import { useSourceStore } from '@/modules/sources/store/useSourceStore';

const userInfo: XtreamUserInfo = {
  username: 'alice',
  password: 'not-persisted',
  message: '',
  auth: 1,
  status: 'Active',
  exp_date: '',
  is_trial: '0',
  active_cons: '0',
  created_at: '',
  max_connections: '1',
  allowed_output_formats: ['m3u8'],
};
const serverInfo: XtreamServerInfo = {
  url: 'primary.test',
  port: '80',
  https_port: '443',
  server_protocol: 'https',
  rtmp_port: '',
  timestamp_now: 0,
  time_now: '',
  timezone: 'UTC',
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  repository.storeXtreamCredentials.mockResolvedValue(undefined);
  repository.deleteXtreamCredentials.mockResolvedValue(undefined);
  vault.deleteProviderPassword.mockResolvedValue(undefined);
  xc.authenticateXtream.mockResolvedValue({ user_info: userInfo, server_info: serverInfo });
  useAuthStore.setState({
    profiles: [],
    runtimes: {},
    isInitializing: false,
    initializationError: null,
  });
  useSourceStore.setState({
    profiles: [],
    runtimes: {},
    enabledSourceIds: [],
    isInitializing: false,
  });
});

describe('multi-Xtream source state and credential boundary', () => {
  it('stores each password only in that source vault record', async () => {
    const first = await useAuthStore.getState().addSource({
      name: 'Main',
      url: 'https://primary.test',
      username: 'alice',
      password: 'secret-one',
    });
    const second = await useAuthStore.getState().addSource({
      name: 'Backup',
      url: 'https://second.test',
      username: 'bob',
      password: 'secret-two',
    });

    expect(first.id).not.toBe(second.id);
    expect(repository.storeXtreamCredentials).toHaveBeenCalledWith(
      first.id,
      expect.objectContaining({
        sourceId: first.id,
        password: 'secret-one',
      }),
    );
    expect(repository.storeXtreamCredentials).toHaveBeenCalledWith(
      second.id,
      expect.objectContaining({
        sourceId: second.id,
        password: 'secret-two',
      }),
    );
    const persisted = localStorage.getItem(XTREAM_PROFILES_STORAGE_KEY) ?? '';
    expect(persisted).not.toContain('secret-one');
    expect(persisted).not.toContain('secret-two');
    expect(persisted).not.toContain('must-not-persist');
    expect(useAuthStore.getState().profiles).toHaveLength(2);
    expect(useSourceStore.getState().enabledSourceIds).toEqual([first.id, second.id]);
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
  });

  it('edits and promotes only the selected source', async () => {
    const first = await useAuthStore.getState().addSource({
      name: 'One',
      url: 'https://one.test',
      alternativeUrls: ['https://one-backup.test'],
      username: 'alice',
      password: 'one',
    });
    const second = await useAuthStore.getState().addSource({
      name: 'Two',
      url: 'https://two.test',
      username: 'bob',
      password: 'two',
    });

    useAuthStore.getState().promoteSourceServer(first.id, 'https://one-backup.test');
    await vi.waitFor(() =>
      expect(useAuthStore.getState().runtimes[first.id]!.credentials).toMatchObject({
        url: 'https://one-backup.test',
        alternativeUrls: ['https://one.test'],
      }),
    );
    expect(useAuthStore.getState().runtimes[second.id]!.credentials?.url).toBe('https://two.test');

    await useAuthStore.getState().updateSource(second.id, {
      name: 'Two Edited',
      url: 'https://two-new.test',
      username: 'bob',
      password: 'new-two',
    });
    expect(useAuthStore.getState().profiles.find((profile) => profile.id === second.id)?.name).toBe(
      'Two Edited',
    );
    expect(useAuthStore.getState().runtimes[first.id]!.credentials?.password).toBe('one');
  });

  it('stores a detected XMLTV override on only its owning Xtream source', async () => {
    const first = await useAuthStore
      .getState()
      .addSource({ url: 'https://one.test', username: 'one', password: 'one' });
    const second = await useAuthStore
      .getState()
      .addSource({ url: 'https://two.test', username: 'two', password: 'two' });

    await useAuthStore.getState().setSourceEpgUrl(second.id, 'https://two.test/guide.xml');

    expect(useAuthStore.getState().runtimes[first.id]!.credentials?.epgUrl).toBeUndefined();
    expect(useAuthStore.getState().runtimes[second.id]!.credentials?.epgUrl).toBe(
      'https://two.test/guide.xml',
    );
    expect(repository.storeXtreamCredentials).toHaveBeenLastCalledWith(
      second.id,
      expect.objectContaining({
        epgUrl: 'https://two.test/guide.xml',
      }),
    );
    expect(localStorage.getItem(XTREAM_PROFILES_STORAGE_KEY)).not.toContain('guide.xml');
  });

  it('migrates the former singleton without putting its password in local storage', async () => {
    localStorage.setItem(
      AUTH_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        credentials: { url: 'https://legacy.test', username: 'legacy' },
        userInfo,
        serverInfo,
      }),
    );
    localStorage.setItem('movena-enabled-sources-v1', JSON.stringify(['xtream']));
    vault.loadProviderPassword.mockResolvedValue('legacy-secret');

    await useAuthStore.getState().initialize();

    const profile = useAuthStore.getState().profiles[0]!;
    expect(profile.id).toBe('xtream-legacy');
    expect(repository.storeXtreamCredentials).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({ password: 'legacy-secret' }),
    );
    expect(localStorage.getItem(XTREAM_PROFILES_STORAGE_KEY)).not.toContain('legacy-secret');
    expect(localStorage.getItem(AUTH_PROFILE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)).toBeNull();
    expect(useSourceStore.getState().enabledSourceIds).toEqual(['xtream-legacy']);
  });

  it('keeps the legacy public profile when its vault password is temporarily unavailable', async () => {
    localStorage.setItem(
      AUTH_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        credentials: { url: 'https://legacy.test', username: 'legacy' },
        userInfo,
        serverInfo,
      }),
    );
    vault.loadProviderPassword.mockResolvedValue(null);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().profiles).toEqual([]);
    expect(localStorage.getItem(AUTH_PROFILE_STORAGE_KEY)).not.toBeNull();
    expect(repository.storeXtreamCredentials).not.toHaveBeenCalled();
  });

  it('removes one account without touching the others', async () => {
    const first = await useAuthStore
      .getState()
      .addSource({ url: 'https://one.test', username: 'one', password: 'one' });
    const second = await useAuthStore
      .getState()
      .addSource({ url: 'https://two.test', username: 'two', password: 'two' });

    await useAuthStore.getState().removeSource(first.id);

    expect(repository.deleteXtreamCredentials).toHaveBeenCalledWith(first.id);
    expect(useAuthStore.getState().profiles.map((profile) => profile.id)).toEqual([second.id]);
    expect(useSourceStore.getState().enabledSourceIds).toEqual([second.id]);
  });

  it('rolls back a newly stored credential when its public profile cannot be persisted', async () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const storageSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === XTREAM_PROFILES_STORAGE_KEY)
        throw new DOMException('quota', 'QuotaExceededError');
      return originalSetItem(key, value);
    });

    await expect(
      useAuthStore.getState().addSource({
        url: 'https://one.test',
        username: 'one',
        password: 'secret',
      }),
    ).rejects.toThrow();

    expect(repository.deleteXtreamCredentials).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().profiles).toEqual([]);
    storageSpy.mockRestore();
  });

  it('does not promote runtime credentials when the vault update fails', async () => {
    const source = await useAuthStore.getState().addSource({
      url: 'https://one.test',
      alternativeUrls: ['https://backup.test'],
      username: 'one',
      password: 'secret',
    });
    repository.storeXtreamCredentials.mockRejectedValueOnce(new Error('vault unavailable'));

    useAuthStore.getState().promoteSourceServer(source.id, 'https://backup.test');
    await vi.waitFor(() => expect(repository.storeXtreamCredentials).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(useAuthStore.getState().runtimes[source.id]!.credentials?.url).toBe(
        'https://one.test',
      ),
    );
  });
});
