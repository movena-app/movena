// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appUpdater = vi.hoisted(() => ({
  checkForAppUpdates: vi.fn(),
  installAppUpdate: vi.fn(),
}));

vi.mock('@/modules/updates/services/appUpdater', () => appUpdater);

import { useUpdateStore } from '@/modules/updates/store/useUpdateStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const closeMock = vi.fn().mockResolvedValue(undefined);
const fakeHandle = { close: closeMock } as unknown as never;

const updateInfo = { version: '9.9.9', currentVersion: '1.0.0', body: 'Notes', date: '2026-01-01' };

beforeEach(() => {
  vi.clearAllMocks();
  closeMock.mockClear();
  useUpdateStore.setState({ phase: 'idle', info: null, progress: null, error: null, handle: null });
  useSettingsStore.getState().resetSettings();
});

describe('useUpdateStore', () => {
  it('moves idle -> checking -> available when an update is found', async () => {
    appUpdater.checkForAppUpdates.mockResolvedValue({
      available: true,
      updateInfo,
      update: fakeHandle,
    });
    const { result } = renderHook(() => useUpdateStore());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.check();
    });
    expect(result.current.phase).toBe('checking');
    await act(() => pending);

    expect(result.current.phase).toBe('available');
    expect(result.current.info).toEqual(updateInfo);
    expect(useSettingsStore.getState().lastUpdateCheckTime).not.toBeNull();
  });

  it('returns to idle with no error when already up to date', async () => {
    appUpdater.checkForAppUpdates.mockResolvedValue({ available: false });
    const { result } = renderHook(() => useUpdateStore());

    await act(() => result.current.check());

    expect(result.current.phase).toBe('idle');
    expect(result.current.info).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces a check failure without throwing', async () => {
    appUpdater.checkForAppUpdates.mockResolvedValue({
      available: false,
      error: 'network unreachable',
    });
    const { result } = renderHook(() => useUpdateStore());

    await act(() => result.current.check());

    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('network unreachable');
  });

  it('ignores a second check while one is already in flight', async () => {
    let resolveCheck!: (value: { available: boolean }) => void;
    appUpdater.checkForAppUpdates.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const { result } = renderHook(() => useUpdateStore());

    let first!: Promise<void>;
    act(() => {
      first = result.current.check();
    });
    await act(() => result.current.check()); // no-op: phase is already 'checking'
    resolveCheck({ available: false });
    await act(() => first);

    expect(appUpdater.checkForAppUpdates).toHaveBeenCalledTimes(1);
  });

  it('reports download progress and lands on restarting once installed', async () => {
    appUpdater.installAppUpdate.mockImplementation(
      async (
        _handle: unknown,
        options: {
          onProgress?: (p: { downloaded: number; total: number | null }) => void;
          onInstalled?: () => void;
        },
      ) => {
        options.onProgress?.({ downloaded: 50, total: 100 });
        options.onProgress?.({ downloaded: 100, total: 100 });
        options.onInstalled?.();
      },
    );
    useUpdateStore.setState({
      phase: 'available',
      info: updateInfo,
      handle: fakeHandle,
      progress: null,
      error: null,
    });
    const { result } = renderHook(() => useUpdateStore());

    await act(() => result.current.install());

    expect(result.current.phase).toBe('restarting');
    expect(result.current.progress).toEqual({ downloaded: 100, total: 100 });
  });

  it('falls back to idle with an error message when install fails', async () => {
    appUpdater.installAppUpdate.mockRejectedValue(new Error('signature verification failed'));
    useUpdateStore.setState({
      phase: 'available',
      info: updateInfo,
      handle: fakeHandle,
      progress: null,
      error: null,
    });
    const { result } = renderHook(() => useUpdateStore());

    await act(() => result.current.install());

    expect(result.current.phase).toBe('idle');
    expect(result.current.handle).toBeNull();
    expect(result.current.error).toBe('signature verification failed');
  });

  it('does nothing when install is called without an available update', async () => {
    const { result } = renderHook(() => useUpdateStore());

    await act(() => result.current.install());

    expect(appUpdater.installAppUpdate).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('dismiss closes the handle, remembers the version, and resets to idle', async () => {
    useUpdateStore.setState({
      phase: 'available',
      info: updateInfo,
      handle: fakeHandle,
      progress: null,
      error: null,
    });
    const { result } = renderHook(() => useUpdateStore());

    act(() => result.current.dismiss());

    await waitFor(() => expect(closeMock).toHaveBeenCalledOnce());
    expect(result.current.phase).toBe('idle');
    expect(result.current.info).toBeNull();
    expect(useSettingsStore.getState().dismissedUpdateVersion).toBe('9.9.9');
  });
});
