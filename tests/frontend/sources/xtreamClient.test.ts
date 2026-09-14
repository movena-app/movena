// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getChannelEPG,
  getStreamUrl,
  getVodCategories,
  PROVIDER_FAILOVER_BUDGET_MS,
  PROVIDER_PRIMARY_TIMEOUT_MS,
} from '@/modules/sources/data/xtreamClient';
import { useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import type { XtreamCredentials } from '@/modules/sources/public/model/xtream';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const credentials: XtreamCredentials = {
  url: 'https://primary.test/',
  alternativeUrls: ['https://backup.test'],
  username: 'alice@example.com',
  password: 'p/a ss',
};

beforeEach(() => {
  useSettingsStore.getState().resetSettings();
  useSettingsStore.getState().updateSetting('debugMode', false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Xtream API client', () => {
  it('builds encoded native stream URLs for each media type', () => {
    expect(getStreamUrl(credentials, 'live', 42)).toBe(
      'https://primary.test/live/alice%40example.com/p%2Fa%20ss/42.m3u8',
    );
    expect(getStreamUrl(credentials, 'vod', 7, 'mkv')).toBe(
      'https://primary.test/movie/alice%40example.com/p%2Fa%20ss/7.mkv',
    );
    expect(getStreamUrl(credentials, 'series', 8)).toBe(
      'https://primary.test/series/alice%40example.com/p%2Fa%20ss/8.mp4',
    );
  });

  it('falls back to an alternative server and promotes it after success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Offline' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ category_id: '10' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const promoteServer = vi.fn();
    useAuthStore.setState({ promoteServer });

    await expect(getVodCategories(credentials)).resolves.toEqual([{ category_id: '10' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('primary.test/player_api.php');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('backup.test/player_api.php');
    expect(promoteServer).toHaveBeenCalledWith('https://backup.test');
  });

  it('normalizes malformed guide payloads to an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(getChannelEPG({ ...credentials, alternativeUrls: [] }, 42)).resolves.toEqual([]);
  });

  it('rejects HTML error pages even when the status is successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>Error</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await expect(getVodCategories({ ...credentials, alternativeUrls: [] })).rejects.toThrow(
      'Returned HTML error page',
    );
  });

  it('fails a hanging primary server within the bounded primary timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = getVodCategories({ ...credentials, alternativeUrls: [] });
    const result = expect(request).rejects.toThrow('Provider request timed out');
    await vi.advanceTimersByTimeAsync(PROVIDER_PRIMARY_TIMEOUT_MS);

    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps a hanging primary plus backup at one failover budget', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = getVodCategories(credentials);
    const result = expect(request).rejects.toThrow('Provider request timed out');
    await vi.advanceTimersByTimeAsync(PROVIDER_PRIMARY_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(PROVIDER_FAILOVER_BUDGET_MS - PROVIDER_PRIMARY_TIMEOUT_MS);

    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not start or fail over a request whose signal was already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));

    await expect(getVodCategories(credentials, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops failover when an in-flight request is cancelled', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Cancelled', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const request = getVodCategories(credentials, controller.signal);
    controller.abort(new DOMException('Cancelled', 'AbortError'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
