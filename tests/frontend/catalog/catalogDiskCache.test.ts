import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProviderList, rememberProviderList } from '@/modules/catalog/data/catalogDiskCache';
import { debugLog } from '@/modules/diagnostics/store/useDebugStore';

const native = vi.hoisted(() => ({ catalogCacheStore: vi.fn(), catalogCacheLoad: vi.fn() }));
const desktop = vi.hoisted(() => ({ value: true }));
vi.mock('@/platform/tauri', () => ({ tauriApi: native }));
vi.mock('@/platform/desktop', () => ({ desktopApi: { isDesktop: () => desktop.value } }));

beforeEach(() => {
  vi.clearAllMocks();
  desktop.value = true;
  native.catalogCacheStore.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('rememberProviderList', () => {
  it('saves the raw list once the catalogue it fed has had time to render', () => {
    vi.useFakeTimers();
    const list = [{ stream_id: 1, name: 'Film' }];

    rememberProviderList('xtream-one', 'vod', 'sources-abc', list);
    expect(native.catalogCacheStore).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);

    expect(native.catalogCacheStore).toHaveBeenCalledWith(
      'xtream-one',
      'vod',
      'sources-abc',
      JSON.stringify(list),
    );
  });

  it('does nothing outside the desktop app or for an empty answer', () => {
    vi.useFakeTimers();
    desktop.value = false;
    rememberProviderList('xtream-one', 'live', 'sources-abc', [{ num: 1 }]);
    desktop.value = true;
    rememberProviderList('xtream-one', 'live', 'sources-abc', []);
    vi.advanceTimersByTime(10_000);

    expect(native.catalogCacheStore).not.toHaveBeenCalled();
  });

  it('logs a failed save without disturbing the catalogue', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(debugLog, 'warn');
    native.catalogCacheStore.mockRejectedValue(new Error('Could not store the catalog cache'));

    rememberProviderList('xtream-one', 'series', 'sources-abc', [{ series_id: 1 }]);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(warn).toHaveBeenCalledWith('api', 'Catalogue could not be saved for the next start', {
      kind: 'series',
      error: 'Could not store the catalog cache',
    });
  });
});

describe('loadProviderList', () => {
  it('returns the saved list with the time it was fetched', async () => {
    native.catalogCacheLoad.mockResolvedValue({ content: '[{"num":1}]', savedAt: 1_700 });

    await expect(loadProviderList('xtream-one', 'vod', 'sources-abc')).resolves.toEqual({
      list: [{ num: 1 }],
      savedAt: 1_700,
    });
    expect(native.catalogCacheLoad).toHaveBeenCalledWith('xtream-one', 'vod', 'sources-abc');
  });

  it('treats a missing copy or one that is not a list as none', async () => {
    native.catalogCacheLoad.mockResolvedValueOnce(null);
    await expect(loadProviderList('xtream-one', 'vod', 'sources-abc')).resolves.toBeNull();

    native.catalogCacheLoad.mockResolvedValueOnce({ content: '{"user_info":{}}', savedAt: 1 });
    await expect(loadProviderList('xtream-one', 'vod', 'sources-abc')).resolves.toBeNull();
  });

  it('surfaces damaged content to the caller', async () => {
    native.catalogCacheLoad.mockResolvedValue({ content: '[{"num":', savedAt: 1 });

    await expect(loadProviderList('xtream-one', 'vod', 'sources-abc')).rejects.toThrow();
  });
});
