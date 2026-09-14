import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';
import type { DownloadStatusEvent } from './contracts';

interface DesktopFileFilter {
  name: string;
  extensions: string[];
}

export interface DesktopOpenDialogOptions {
  multiple?: boolean | undefined;
  directory?: boolean | undefined;
  filters?: DesktopFileFilter[] | undefined;
}

export interface DesktopSaveDialogOptions {
  defaultPath?: string | undefined;
  filters?: DesktopFileFilter[] | undefined;
}

export interface ResolverStatusEventData {
  provider: 'twitch';
  phase: 'starting' | 'ready' | 'ad-break' | 'failed';
  expectedDurationSeconds?: number | undefined;
  code?: string | undefined;
}

export interface MpvEvent {
  type: 'property-change' | 'end-file' | 'log-message' | 'resolver-status';
  name?: string | undefined;
  data?: unknown | undefined;
  sessionId?: string | undefined;
}

interface DesktopUpdateProgress {
  downloaded: number;
  total: number | null;
}

export interface DesktopUpdate {
  version: string;
  currentVersion: string;
  body?: string | undefined;
  date?: string | undefined;
  downloadAndInstall: (onProgress?: (progress: DesktopUpdateProgress) => void) => Promise<void>;
  close: () => Promise<void>;
}

async function checkForUpdate(): Promise<DesktopUpdate | null> {
  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    ...(update.body == null ? {} : { body: update.body }),
    ...(update.date == null ? {} : { date: update.date }),
    downloadAndInstall: async (onProgress) => {
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? null;
            onProgress?.({ downloaded, total });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            onProgress?.({ downloaded, total });
            break;
          case 'Finished':
            if (total !== null) downloaded = total;
            onProgress?.({ downloaded, total });
            break;
        }
      });
    },
    close: () => update.close(),
  };
}

/** Typed boundary around Tauri events, window APIs, and JavaScript plugins. */
export const desktopApi = {
  isDesktop: () => isTauri(),

  onMpvEvent: (handler: (event: MpvEvent) => void) =>
    listen<MpvEvent>('mpv-event', ({ payload }) => handler(payload)),
  onDownloadEvent: (handler: (event: DownloadStatusEvent) => void) =>
    listen<DownloadStatusEvent>('download-event', ({ payload }) => handler(payload)),
  onPointerMoved: (handler: () => void) => listen('pointer-moved', handler),

  minimizeWindow: () => getCurrentWindow().minimize(),
  toggleMaximizeWindow: () => getCurrentWindow().toggleMaximize(),
  closeWindow: () => getCurrentWindow().close(),
  setAlwaysOnTop: (alwaysOnTop: boolean) => getCurrentWindow().setAlwaysOnTop(alwaysOnTop),

  openPath: (options: DesktopOpenDialogOptions) =>
    open({
      ...(options.multiple !== undefined ? { multiple: options.multiple } : {}),
      ...(options.directory !== undefined ? { directory: options.directory } : {}),
      ...(options.filters !== undefined ? { filters: options.filters } : {}),
    }),
  savePath: (options: DesktopSaveDialogOptions) =>
    save({
      ...(options.defaultPath !== undefined ? { defaultPath: options.defaultPath } : {}),
      ...(options.filters !== undefined ? { filters: options.filters } : {}),
    }),
  openUrl: (url: string) => openUrl(url),
  revealItemInDir: (path: string) => revealItemInDir(path),
  getVersion: () => getVersion(),
  checkForUpdate,
  relaunch: () => relaunch(),
};
