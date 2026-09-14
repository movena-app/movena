import { desktopApi, type DesktopUpdate } from '@/platform/desktop';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string | undefined;
  date?: string | undefined;
}

export interface UpdateDownloadProgress {
  /** Bytes downloaded so far. */
  downloaded: number;
  /** Total size in bytes, or null when the server didn't report a length. */
  total: number | null;
}

let isChecking = false;

export async function checkForAppUpdates(): Promise<{
  available: boolean;
  updateInfo?: UpdateInfo | undefined;
  /** The live update handle — pass to {@link installAppUpdate} to download it. */
  update?: DesktopUpdate | undefined;
  error?: string | undefined;
}> {
  if (isChecking) {
    return { available: false };
  }

  isChecking = true;
  try {
    const update = await desktopApi.checkForUpdate();
    if (!update) {
      return { available: false };
    }

    return {
      available: true,
      updateInfo: {
        version: update.version,
        currentVersion: update.currentVersion,
        ...(update.body === undefined ? {} : { body: update.body }),
        ...(update.date === undefined ? {} : { date: update.date }),
      },
      update,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[appUpdater] Update check failed:', message);
    return { available: false, error: message };
  } finally {
    isChecking = false;
  }
}

/**
 * Downloads and installs an update found by {@link checkForAppUpdates}, then
 * relaunches the app so the new version actually takes effect.
 *
 * Restarting is not optional here: on macOS the plugin only swaps the
 * installed .app bundle on disk — nothing visibly happens until the process
 * restarts, which is exactly why an update used to look like it silently did
 * nothing until the app was later closed by hand. Folding the relaunch into
 * this call means every caller gets it for free instead of having to
 * remember it.
 */
export async function installAppUpdate(
  update: DesktopUpdate,
  options: {
    onProgress?: ((progress: UpdateDownloadProgress) => void) | undefined;
    /** Fires once install has finished, right before the app relaunches. */
    onInstalled?: (() => void) | undefined;
  } = {},
): Promise<void> {
  const { onProgress, onInstalled } = options;
  try {
    await update.downloadAndInstall(onProgress);
  } finally {
    // Release the backend resource handle regardless of outcome. Errors here
    // are not worth surfacing — the app is either about to relaunch or the
    // caller already has a real error from downloadAndInstall to show.
    await update.close().catch(() => {});
  }

  onInstalled?.();
  await desktopApi.relaunch();
}
