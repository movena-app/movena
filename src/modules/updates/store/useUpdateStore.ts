import { create } from 'zustand';
import type { DesktopUpdate } from '@/platform/desktop';
import {
  checkForAppUpdates,
  installAppUpdate,
  type UpdateDownloadProgress,
  type UpdateInfo,
} from '../services/appUpdater';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';

type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'restarting';

interface UpdateState {
  phase: UpdatePhase;
  info: UpdateInfo | null;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  /** The live plugin resource behind `info` — never rendered, just held for install(). */
  handle: DesktopUpdate | null;
  /** Looks for an update. Resolves once idle/available/error is reached. */
  check: () => Promise<void>;
  /** Downloads and installs the update found by check(), then relaunches the app. */
  install: () => Promise<void>;
  /** Drops an available update without installing it and silences it for this version. */
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  phase: 'idle',
  info: null,
  progress: null,
  error: null,
  handle: null,

  check: async () => {
    // A check already in flight, or a download/install/restart in progress —
    // never let a second check tear down the handle install() is using.
    if (get().phase !== 'idle') return;

    set({ phase: 'checking', error: null });
    try {
      const result = await checkForAppUpdates();
      useSettingsStore.getState().updateSetting('lastUpdateCheckTime', Date.now());
      if (result.available && result.updateInfo && result.update) {
        set({
          phase: 'available',
          info: result.updateInfo,
          handle: result.update,
          progress: null,
          error: null,
        });
        return;
      }
      set({ phase: 'idle', info: null, handle: null, progress: null, error: result.error ?? null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ phase: 'idle', info: null, handle: null, progress: null, error: message });
    }
  },

  install: async () => {
    const { handle, phase } = get();
    if (phase !== 'available' || !handle) return;

    set({ phase: 'downloading', progress: { downloaded: 0, total: null }, error: null });
    try {
      await installAppUpdate(handle, {
        onProgress: (progress) =>
          set((state) => (state.phase === 'downloading' ? { progress } : {})),
        onInstalled: () => set({ phase: 'restarting' }),
      });
      // installAppUpdate relaunches the app on success — this line normally
      // never runs before the process restarts.
    } catch (err) {
      // installAppUpdate always releases the handle itself (success or
      // failure) before rethrowing, so there is nothing left here to close —
      // just drop the stale reference and let the user re-check for a fresh one.
      const message = err instanceof Error ? err.message : String(err);
      set({ phase: 'idle', info: null, handle: null, progress: null, error: message });
    }
  },

  dismiss: () => {
    const { handle, info } = get();
    handle?.close().catch(() => {});
    if (info) useSettingsStore.getState().updateSetting('dismissedUpdateVersion', info.version);
    set({ phase: 'idle', info: null, handle: null, progress: null, error: null });
  },
}));
