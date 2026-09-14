import { tauriApi, type MpvPropertyUpdate } from '@/platform/tauri';
import { aspectSettingsFor, type AspectMode } from '@/modules/catalog/public/lib/aspect';

/**
 * Push an aspect mode to the running mpv instance.
 *
 * Every property in the mode is sent, not just the ones that changed, so a
 * switch can never inherit a leftover from the previous mode — going from Zoom
 * to 16:9 has to clear the pan-and-scan, not only set the ratio.
 *
 * Safe to call with no player running: the backend replies that mpv is not
 * running and there is nothing to undo.
 */
export async function applyAspectRatio(mode: AspectMode, throwOnError = false): Promise<void> {
  const settings = aspectSettingsFor(mode);
  const updates: MpvPropertyUpdate[] = [
    { property: 'video-aspect-override', value: settings['video-aspect-override'] },
    { property: 'keepaspect', value: settings.keepaspect },
    { property: 'panscan', value: settings.panscan },
    { property: 'video-unscaled', value: settings['video-unscaled'] },
  ];
  for (const update of updates) {
    try {
      await tauriApi.mpvSetProperty(update);
    } catch (error: unknown) {
      if (throwOnError) throw error;
      /* Settings may change with no player running; the next session reapplies them. */
    }
  }
}

/**
 * Convert a side-by-side source to a normal 2D picture by keeping its left
 * eye. The crop must be applied before the aspect settings: mpv recalculates
 * the source dimensions when a crop changes, and applying the aspect first
 * can leave the cropped eye displayed as a tall 8:9 image.
 */
export async function applySbsTo2d(enabled: boolean, restoreMode: AspectMode): Promise<void> {
  await tauriApi.mpvSetProperty({ property: 'video-crop', value: enabled ? '50%x100%+0+0' : '' });
  await applyAspectRatio(enabled ? '16:9' : restoreMode, true);
}
