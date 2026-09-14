import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock('@/platform/desktop', () => ({ desktopApi: desktop }));

import { checkForAppUpdates, installAppUpdate } from '@/modules/updates/services/appUpdater';

beforeEach(() => {
  desktop.checkForUpdate.mockReset();
  desktop.relaunch.mockReset();
});

describe('app updater service', () => {
  it('returns update metadata and preserves the live install handle', async () => {
    const update = {
      version: '0.1.9',
      currentVersion: '0.1.8',
      body: 'Maintenance release',
      date: '2026-08-25',
      downloadAndInstall: vi.fn(),
      close: vi.fn(),
    };
    desktop.checkForUpdate.mockResolvedValue(update);

    await expect(checkForAppUpdates()).resolves.toEqual({
      available: true,
      updateInfo: {
        version: '0.1.9',
        currentVersion: '0.1.8',
        body: 'Maintenance release',
        date: '2026-08-25',
      },
      update,
    });
  });

  it('normalizes no-update and failure results without throwing', async () => {
    desktop.checkForUpdate.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'));
    await expect(checkForAppUpdates()).resolves.toEqual({ available: false });
    await expect(checkForAppUpdates()).resolves.toEqual({ available: false, error: 'offline' });
  });

  it('reports download progress, closes the update, and relaunches after success', async () => {
    const progress = vi.fn();
    const installed = vi.fn();
    const update = {
      version: '0.1.9',
      currentVersion: '0.1.8',
      downloadAndInstall: vi.fn(
        async (onProgress?: (value: { downloaded: number; total: number | null }) => void) => {
          onProgress?.({ downloaded: 10, total: 20 });
        },
      ),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await installAppUpdate(update, { onProgress: progress, onInstalled: installed });

    expect(progress).toHaveBeenCalledWith({ downloaded: 10, total: 20 });
    expect(update.close).toHaveBeenCalledOnce();
    expect(installed).toHaveBeenCalledOnce();
    expect(desktop.relaunch).toHaveBeenCalledOnce();
  });

  it('always closes a failed update and does not relaunch', async () => {
    const update = {
      version: '0.1.9',
      currentVersion: '0.1.8',
      downloadAndInstall: vi.fn().mockRejectedValue(new Error('signature mismatch')),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(installAppUpdate(update)).rejects.toThrow('signature mismatch');
    expect(update.close).toHaveBeenCalledOnce();
    expect(desktop.relaunch).not.toHaveBeenCalled();
  });
});
