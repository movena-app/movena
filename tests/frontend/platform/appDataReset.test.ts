// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tauriApi } from '@/platform/tauri';
import { queryClient } from '@/shared/query/queryClient';
import { clearAllAppData } from '@/modules/settings/services/appDataReset';
import { storeM3uConnection, loadM3uConnection } from '@/modules/sources/services/m3uRepository';
import {
  storeXtreamCredentials,
  loadXtreamCredentials,
} from '@/modules/sources/services/xtreamRepository';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { useSearchStore } from '@/modules/search/store/useSearchStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useSourceStore } from '@/modules/sources/store/useSourceStore';
import { useStreamVerificationStore } from '@/modules/sources/store/useStreamVerificationStore';
import { writePlaybackRecovery } from '@/modules/playback/lib/playbackRecovery';

const m3uId = 'm3u-12345678';
const xtreamId = 'xtream-12345678';
const secrets = new Map<string, string>();

beforeEach(() => {
  vi.restoreAllMocks();
  secrets.clear();
  vi.spyOn(tauriApi, 'sourceSecretStore').mockImplementation(async (sourceId, value) => {
    secrets.set(sourceId, value);
  });
  vi.spyOn(tauriApi, 'sourceSecretLoad').mockImplementation(
    async (sourceId) => secrets.get(sourceId) ?? null,
  );
  vi.spyOn(tauriApi, 'sourceSecretDelete').mockImplementation(async (sourceId) => {
    secrets.delete(sourceId);
  });
  vi.spyOn(tauriApi, 'downloadMediaCancel').mockResolvedValue(undefined);
  vi.spyOn(tauriApi, 'mpvStop').mockResolvedValue(undefined);
  vi.spyOn(tauriApi, 'appDataClear').mockImplementation(async () => {
    secrets.clear();
  });
  localStorage.clear();
  queryClient.clear();
  useSettingsStore.getState().resetSettings();
  useSourceStore.setState({
    profiles: [],
    runtimes: {},
    enabledSourceIds: [],
    isInitializing: false,
    initializationError: null,
  });
  useAuthStore.setState({
    profiles: [],
    runtimes: {},
    isInitializing: false,
    initializationError: null,
  });
  useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
  useDownloadStore.setState({ jobs: [] });
  useSearchStore.setState({ recentSearches: [] });
});

describe('clearAllAppData', () => {
  it('stops native playback before deleting desktop caches', async () => {
    const calls: string[] = [];
    vi.spyOn(tauriApi, 'mpvStop').mockImplementation(async () => {
      calls.push('stop');
    });
    vi.spyOn(tauriApi, 'appDataClear').mockImplementation(async () => {
      calls.push('clear');
    });

    await clearAllAppData();

    expect(calls).toEqual(['stop', 'clear']);
  });

  it('removes persisted state, source credentials, library data, download records, and cached queries', async () => {
    await storeM3uConnection(m3uId, { location: 'https://list.test/main.m3u' });
    await storeXtreamCredentials(xtreamId, {
      sourceId: xtreamId,
      url: 'https://provider.test',
      username: 'alice',
      password: 'secret',
    });
    useSettingsStore.getState().updateSetting('accentColor', '#af52de');
    useSourceStore.setState({
      profiles: [
        {
          id: m3uId,
          kind: 'm3u',
          name: 'Playlist',
          locationType: 'remote',
          locationLabel: 'list.test',
          refreshIntervalMinutes: 360,
          lastRefreshAt: 0,
          entryCount: 1,
          liveCount: 1,
          vodCount: 0,
          seriesCount: 0,
          hasEpg: false,
        },
      ],
      enabledSourceIds: [m3uId],
    });
    useAuthStore.setState({
      profiles: [
        {
          id: xtreamId,
          kind: 'xtream',
          name: 'Provider',
          locationLabel: 'provider.test',
          username: 'alice',
          userInfo: {
            username: 'alice',
            message: '',
            auth: 1,
            status: 'Active',
            exp_date: '0',
            is_trial: '0',
            active_cons: '0',
            created_at: '0',
            max_connections: '1',
            allowed_output_formats: [],
          },
          serverInfo: {
            url: 'https://provider.test',
            port: '80',
            https_port: '443',
            server_protocol: 'https',
            rtmp_port: '0',
            timestamp_now: 0,
            time_now: '',
            timezone: 'UTC',
          },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    useLibraryStore.setState({
      history: [
        {
          id: 'movie-1',
          title: 'Movie',
          posterUrl: '',
          type: 'vod',
          progressPercentage: 50,
          lastWatchedAt: 1,
        },
      ] as never,
    });
    useDownloadStore
      .getState()
      .enqueue({ id: 'download-1', sourceUrl: 'https://media.test/movie.mp4' });
    useSearchStore.getState().addRecentSearch('private query');
    useStreamVerificationStore
      .getState()
      .recordVerification('private-stream', { width: 1920, height: 1080 });
    writePlaybackRecovery({
      streamId: 'private-stream',
      title: 'Private',
      type: 'vod',
      currentTime: 2,
      duration: 10,
      savedAt: Date.now(),
    });
    localStorage.setItem(`movena-m3u-editor-draft-v1:${m3uId}`, 'private playlist');
    localStorage.setItem('movena-m3u-editor-filters-v1', 'private filter');
    queryClient.setQueryData(['catalog', 'private-source'], [{ id: 'movie-1' }]);

    await clearAllAppData();

    expect(useSettingsStore.getState().accentColor).toBe('#0672e5');
    expect(useSourceStore.getState().profiles).toEqual([]);
    expect(useAuthStore.getState().profiles).toEqual([]);
    expect(useLibraryStore.getState().history).toEqual([]);
    expect(useDownloadStore.getState().jobs).toEqual([]);
    expect(useSearchStore.getState().recentSearches).toEqual([]);
    expect(useStreamVerificationStore.getState().verifiedStreams).toEqual({});
    expect(await loadM3uConnection(m3uId)).toBeNull();
    expect(await loadXtreamCredentials(xtreamId)).toBeNull();
    expect(queryClient.getQueryData(['catalog', 'private-source'])).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
});
