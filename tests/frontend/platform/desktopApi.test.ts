import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  isTauri: vi.fn(),
  listen: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  closeWindow: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  openUrl: vi.fn(),
  revealItemInDir: vi.fn(),
  relaunch: vi.fn(),
  check: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
    close: mocks.closeWindow,
    setAlwaysOnTop: mocks.setAlwaysOnTop,
  }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open, save: mocks.save }));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: mocks.openUrl,
  revealItemInDir: mocks.revealItemInDir,
}));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));

import { desktopApi } from '@/platform/desktop';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isTauri.mockReturnValue(true);
  mocks.listen.mockResolvedValue(vi.fn());
});

describe('desktop API gateway', () => {
  it('owns window, dialog, opener, metadata, and relaunch operations', async () => {
    mocks.getVersion.mockResolvedValue('1.2.3');
    mocks.open.mockResolvedValue('C:/playlist.m3u');
    mocks.save.mockResolvedValue('C:/backup.json');

    expect(desktopApi.isDesktop()).toBe(true);
    await desktopApi.minimizeWindow();
    await desktopApi.toggleMaximizeWindow();
    await desktopApi.closeWindow();
    await desktopApi.setAlwaysOnTop(true);
    await desktopApi.openPath({
      multiple: false,
      directory: false,
      filters: [{ name: 'Playlist', extensions: ['m3u'] }],
    });
    await desktopApi.savePath({
      defaultPath: 'backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    await desktopApi.openPath({});
    await desktopApi.savePath({});
    await desktopApi.openUrl('https://movena.test');
    await desktopApi.revealItemInDir('C:/movie.mkv');
    await desktopApi.relaunch();

    expect(await desktopApi.getVersion()).toBe('1.2.3');
    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Playlist', extensions: ['m3u'] }],
    });
    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: 'backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    expect(mocks.open).toHaveBeenLastCalledWith({});
    expect(mocks.save).toHaveBeenLastCalledWith({});
    expect(mocks.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('delivers typed event payloads and returns listener cleanup', async () => {
    const unlisten = vi.fn();
    mocks.listen.mockResolvedValue(unlisten);
    const mpvHandler = vi.fn();
    const downloadHandler = vi.fn();
    const pointerHandler = vi.fn();

    await expect(desktopApi.onMpvEvent(mpvHandler)).resolves.toBe(unlisten);
    const mpvListener = mocks.listen.mock.calls[0]![1] as (event: { payload: unknown }) => void;
    mpvListener({
      payload: { type: 'property-change', name: 'volume', data: 42, sessionId: 'session' },
    });
    mpvListener({
      payload: {
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'ad-break', expectedDurationSeconds: 30 },
        sessionId: 'session',
      },
    });
    await desktopApi.onDownloadEvent(downloadHandler);
    const downloadListener = mocks.listen.mock.calls[1]![1] as (event: {
      payload: unknown;
    }) => void;
    downloadListener({
      payload: { id: 'download', state: 'completed', downloadedBytes: 1, totalBytes: 1 },
    });
    await desktopApi.onPointerMoved(pointerHandler);
    const pointerListener = mocks.listen.mock.calls[2]![1] as () => void;
    pointerListener();

    expect(mpvHandler).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session' }));
    expect(mpvHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'ad-break', expectedDurationSeconds: 30 },
      }),
    );
    expect(downloadHandler).toHaveBeenCalledWith(expect.objectContaining({ id: 'download' }));
    expect(pointerHandler).toHaveBeenCalledOnce();
  });

  it('maps updater progress to Movena-owned DTOs', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const downloadAndInstall = vi.fn(async (handler: (event: unknown) => void) => {
      handler({ event: 'Started', data: { contentLength: 10 } });
      handler({ event: 'Progress', data: { chunkLength: 4 } });
      handler({ event: 'Finished', data: {} });
    });
    mocks.check.mockResolvedValue({
      version: '2.0.0',
      currentVersion: '1.0.0',
      body: null,
      date: null,
      downloadAndInstall,
      close,
    });
    const update = await desktopApi.checkForUpdate();
    const progress = vi.fn();
    await update?.downloadAndInstall(progress);
    await update?.close();

    expect(update).toMatchObject({ version: '2.0.0', currentVersion: '1.0.0' });
    expect(progress).toHaveBeenLastCalledWith({ downloaded: 10, total: 10 });
    expect(close).toHaveBeenCalledOnce();

    const noLengthDownload = vi.fn(async (handler: (event: unknown) => void) => {
      handler({ event: 'Started', data: {} });
      handler({ event: 'Finished', data: {} });
    });
    mocks.check.mockResolvedValue({
      version: '2.1.0',
      currentVersion: '2.0.0',
      body: 'Notes',
      date: '2026-08-24',
      downloadAndInstall: noLengthDownload,
      close,
    });
    const datedUpdate = await desktopApi.checkForUpdate();
    await datedUpdate?.downloadAndInstall();
    expect(datedUpdate).toMatchObject({ body: 'Notes', date: '2026-08-24' });

    mocks.check.mockResolvedValue(null);
    await expect(desktopApi.checkForUpdate()).resolves.toBeNull();
  });
});
