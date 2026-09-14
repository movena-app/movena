import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { tauriApi, type MpvStartOptions } from '@/platform/tauri';

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe('typed Tauri IPC wrapper', () => {
  it('passes mpv start settings as one camel-cased options object', async () => {
    const options: MpvStartOptions = {
      url: 'https://stream.test/movie',
      hwdec: 'auto-safe',
      hdr: true,
      toneMapping: 'hable',
      cacheSecs: 30,
      demuxerMaxBytes: '150MiB',
      initialVolume: 75,
      initialSpeed: 1.25,
      subtitlesVisible: false,
      sessionId: 'session-1',
      initialAudioDelayMs: 120,
      startPosition: 42,
      httpHeaders: { Referer: 'https://portal.test/' },
    };

    await tauriApi.mpvStart(options);
    expect(invokeMock).toHaveBeenCalledWith('mpv_start', { options });
  });

  it.each([
    ['mpvSeek', [12], 'mpv_seek', { position: 12 }],
    ['mpvSeekRelative', [-10], 'mpv_seek_relative', { seconds: -10 }],
    ['mpvSetVolume', [55], 'mpv_set_volume', { volume: 55 }],
    ['mpvSetSpeed', [1.5], 'mpv_set_speed', { speed: 1.5 }],
    ['mpvSetAudioTrack', [3], 'mpv_set_audio_track', { trackId: 3 }],
    ['mpvSetSubTrack', [4], 'mpv_set_sub_track', { trackId: 4 }],
    ['mpvSetRecording', ['recording.ts'], 'mpv_set_recording', { path: 'recording.ts' }],
    [
      'mpvSetProperty',
      [{ property: 'panscan', value: '0' }],
      'mpv_set_property',
      { update: { property: 'panscan', value: '0' } },
    ],
    ['playerSetFullscreen', [true], 'player_set_fullscreen', { on: true }],
    ['playerSetCursorHidden', [true], 'player_set_cursor_hidden', { hidden: true }],
    ['credentialStore', ['secret'], 'credential_store', { password: 'secret' }],
    [
      'sourceSecretStore',
      ['m3u-source', 'secret-json'],
      'source_secret_store',
      { sourceId: 'm3u-source', value: 'secret-json' },
    ],
    ['sourceSecretLoad', ['m3u-source'], 'source_secret_load', { sourceId: 'm3u-source' }],
    ['sourceSecretDelete', ['m3u-source'], 'source_secret_delete', { sourceId: 'm3u-source' }],
    [
      'm3uFetch',
      [{ url: 'https://list.test/a.m3u' }],
      'm3u_fetch',
      { options: { url: 'https://list.test/a.m3u' } },
    ],
    [
      'm3uProbeStream',
      [{ url: 'https://stream.test/live', timeoutMs: 5000 }],
      'm3u_probe_stream',
      { options: { url: 'https://stream.test/live', timeoutMs: 5000 } },
    ],
    [
      'xmltvFetch',
      [{ url: 'https://guide.test/epg.xml.gz', headers: { Referer: 'https://portal.test' } }],
      'xmltv_fetch',
      {
        options: {
          url: 'https://guide.test/epg.xml.gz',
          headers: { Referer: 'https://portal.test' },
        },
      },
    ],
    [
      'downloadMediaStart',
      [{ id: 'job-1', url: 'https://media.test/movie.mp4', fileName: 'movie.mp4' }],
      'download_media_start',
      { options: { id: 'job-1', url: 'https://media.test/movie.mp4', fileName: 'movie.mp4' } },
    ],
    ['downloadMediaPause', ['job-1'], 'download_media_pause', { id: 'job-1' }],
    ['downloadMediaResume', ['job-1'], 'download_media_resume', { id: 'job-1' }],
    ['downloadMediaCancel', ['job-1'], 'download_media_cancel', { id: 'job-1' }],
    [
      'downloadMediaDelete',
      [{ path: 'C:\\Downloads\\movie.mp4' }],
      'download_media_delete',
      { options: { path: 'C:\\Downloads\\movie.mp4' } },
    ],
    ['m3uReadFile', ['C:\\list.m3u'], 'm3u_read_file', { path: 'C:\\list.m3u' }],
    [
      'm3uWriteFile',
      ['C:\\list.m3u', '#EXTM3U\n'],
      'm3u_write_file',
      { path: 'C:\\list.m3u', content: '#EXTM3U\n' },
    ],
    ['m3uCacheLoad', ['m3u-source'], 'm3u_cache_load', { sourceId: 'm3u-source' }],
    ['m3uCacheDelete', ['m3u-source'], 'm3u_cache_delete', { sourceId: 'm3u-source' }],
    [
      'appDataClear',
      [['m3u-source', 'xtream-source']],
      'app_data_clear',
      { sourceIds: ['m3u-source', 'xtream-source'] },
    ],
    [
      'settingsConfigRead',
      ['C:\\backup.json'],
      'settings_config_read',
      { path: 'C:\\backup.json' },
    ],
    [
      'settingsConfigWrite',
      ['C:\\backup.json', '{"format":"movena.settings"}'],
      'settings_config_write',
      { path: 'C:\\backup.json', content: '{"format":"movena.settings"}' },
    ],
  ] as const)('%s uses the native command contract', async (method, args, command, payload) => {
    const invokeMethod = tauriApi[method] as unknown as (...values: unknown[]) => Promise<unknown>;
    await invokeMethod(...args);
    expect(invokeMock).toHaveBeenCalledWith(command, payload);
  });

  it.each([
    ['mpvStop', 'mpv_stop'],
    ['mpvPlayPause', 'mpv_play_pause'],
    ['credentialLoad', 'credential_load'],
    ['credentialDelete', 'credential_delete'],
  ] as const)('%s invokes without an accidental payload', async (method, command) => {
    await tauriApi[method]();
    expect(invokeMock).toHaveBeenCalledWith(command);
  });

  it('stores the exact source-scoped playlist document payload', async () => {
    const document = { content: '#EXTM3U', baseUrl: 'https://list.test/main.m3u' };
    await tauriApi.m3uCacheStore('m3u-source', document);
    expect(invokeMock).toHaveBeenCalledWith('m3u_cache_store', {
      sourceId: 'm3u-source',
      document,
    });
  });

  it('passes the opaque M3U cache key to the native downloader', async () => {
    const options = { url: 'https://list.test/a.m3u', cacheKey: 'm3u-source' };
    await tauriApi.m3uFetch(options);
    expect(invokeMock).toHaveBeenCalledWith('m3u_fetch', { options });
  });
});
