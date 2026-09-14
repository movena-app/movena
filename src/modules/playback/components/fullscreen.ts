import { tauriApi } from '@/platform/tauri';
import { usePlayerStore } from '../store/usePlayerStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';

/**
 * Enter or leave player fullscreen.
 *
 * Routed through the backend rather than the DOM or the window API. The video
 * is not a DOM node but an mpv-owned window behind the transparent webview, so
 * `element.requestFullscreen()` would move the web content into a window of its
 * own and leave the video behind — and on macOS a *native* fullscreen space
 * makes the video draw over the controls no matter how the windows are ordered.
 * The backend picks whatever mechanism keeps the two composited correctly.
 *
 * The native round trip (window resize + AppKit animation on macOS) is slow
 * enough that a second call — a key-repeat `F`, or a fast double-click landing
 * right after a single-click's fullscreen toggle — can arrive before the store
 * reflects the first one. Reading `isFullscreen` at that point returns the
 * *pre*-toggle value, so the second call requests the same direction again
 * instead of undoing it, which is exactly the state corruption the "toggling a
 * lot" reports traced back to. Queuing behind any in-flight call means every
 * caller always reads the settled value.
 */
let pending: Promise<void> | null = null;

export async function setPlayerFullscreen(on: boolean): Promise<void> {
  if (pending) await pending.catch(() => {});
  const run = (async () => {
    try {
      const applied = await tauriApi.playerSetFullscreen(on);
      usePlayerStore.getState().setIsFullscreen(applied);
    } catch (error: unknown) {
      // Only forced on the way *out*. A failed attempt to enter fullscreen
      // must not claim success — that would hide the custom window chrome
      // over a window that never actually left its normal bounds. A failed
      // attempt to leave is the opposite risk: the native window is in
      // some unknown state, but the frontend still asked to be windowed,
      // and leaving `isFullscreen` stuck true is what left Escape/close
      // looking like they'd hidden Minimize/Maximize/Close for good.
      if (!on) usePlayerStore.getState().setIsFullscreen(false);
      notify.error(
        'Fullscreen Failed',
        getErrorMessage(error, 'player_set_fullscreen failed without an error message.'),
        undefined,
        undefined,
        'playback',
      );
    }
  })();
  pending = run;
  try {
    await run;
  } finally {
    if (pending === run) pending = null;
  }
}

/** Shared by the fullscreen button and the `F` shortcut so they cannot drift. */
export async function toggleWindowFullscreen(): Promise<void> {
  if (pending) await pending.catch(() => {});
  await setPlayerFullscreen(!usePlayerStore.getState().isFullscreen);
}
