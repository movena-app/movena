import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mpvSetProperty, playerSetFullscreen } = vi.hoisted(() => ({
  mpvSetProperty: vi.fn(),
  playerSetFullscreen: vi.fn(),
}));

vi.mock('@/platform/tauri', () => ({
  tauriApi: { mpvSetProperty, playerSetFullscreen },
}));

import { applyAspectRatio, applySbsTo2d } from '@/modules/playback/components/aspect';
import {
  setPlayerFullscreen,
  toggleWindowFullscreen,
} from '@/modules/playback/components/fullscreen';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

beforeEach(() => {
  mpvSetProperty.mockReset().mockResolvedValue(undefined);
  playerSetFullscreen.mockResolvedValue(true);
  usePlayerStore.getState().closePlayer();
  usePlayerStore.getState().setIsFullscreen(false);
});

describe('native player command helpers', () => {
  it('always sends the complete aspect property set', async () => {
    await applyAspectRatio('zoom');

    expect(mpvSetProperty.mock.calls).toEqual([
      [{ property: 'video-aspect-override', value: '-2' }],
      [{ property: 'keepaspect', value: 'yes' }],
      [{ property: 'panscan', value: '1' }],
      [{ property: 'video-unscaled', value: 'no' }],
    ]);
  });

  it('continues applying independent aspect properties after one rejection', async () => {
    mpvSetProperty.mockRejectedValueOnce(new Error('not running')).mockResolvedValue(undefined);
    await expect(applyAspectRatio('auto')).resolves.toBeUndefined();
    expect(mpvSetProperty).toHaveBeenCalledTimes(4);
  });

  it('preserves the native aspect command error for active-player callers', async () => {
    mpvSetProperty.mockRejectedValueOnce(new Error('mpv rejected panscan'));
    await expect(applyAspectRatio('auto', true)).rejects.toThrow('mpv rejected panscan');
  });

  it('applies the SBS crop before the complete normal 16:9 framing', async () => {
    await applySbsTo2d(true, 'auto');

    expect(mpvSetProperty.mock.calls).toEqual([
      [{ property: 'video-crop', value: '50%x100%+0+0' }],
      [{ property: 'video-aspect-override', value: '16:9' }],
      [{ property: 'keepaspect', value: 'yes' }],
      [{ property: 'panscan', value: '0' }],
      [{ property: 'video-unscaled', value: 'no' }],
    ]);
  });

  it('stores the fullscreen state actually reported by the backend', async () => {
    playerSetFullscreen.mockResolvedValue(false);
    await setPlayerFullscreen(true);
    expect(playerSetFullscreen).toHaveBeenCalledWith(true);
    expect(usePlayerStore.getState().isFullscreen).toBe(false);
  });

  it('toggles from the current event-authoritative store state', async () => {
    await toggleWindowFullscreen();
    expect(playerSetFullscreen).toHaveBeenCalledWith(true);
  });

  it('serializes back-to-back toggles so each reads the settled state', async () => {
    // First toggle: off → on
    playerSetFullscreen.mockResolvedValueOnce(true);
    // Second toggle should see the settled `true` and request `false`
    playerSetFullscreen.mockResolvedValueOnce(false);

    const first = toggleWindowFullscreen();
    const second = toggleWindowFullscreen();
    await Promise.all([first, second]);

    expect(playerSetFullscreen).toHaveBeenCalledTimes(2);
    expect(playerSetFullscreen).toHaveBeenNthCalledWith(1, true);
    expect(playerSetFullscreen).toHaveBeenNthCalledWith(2, false);
    expect(usePlayerStore.getState().isFullscreen).toBe(false);
  });

  it('does not corrupt store state when the backend rejects', async () => {
    usePlayerStore.getState().setIsFullscreen(false);
    playerSetFullscreen.mockRejectedValueOnce(new Error('Win32 error'));

    await setPlayerFullscreen(true);
    // The store should remain at its pre-call value since the backend errored
    expect(usePlayerStore.getState().isFullscreen).toBe(false);
  });

  it('allows a new call after a prior rejection', async () => {
    playerSetFullscreen.mockRejectedValueOnce(new Error('transient'));
    await setPlayerFullscreen(true);

    playerSetFullscreen.mockResolvedValueOnce(true);
    await setPlayerFullscreen(true);
    expect(usePlayerStore.getState().isFullscreen).toBe(true);
  });

  it('still leaves fullscreen in the store even when the backend fails to leave it', async () => {
    // Unlike entering fullscreen, a failed *exit* must not get stuck: there
    // would be no way left to reach the custom window chrome (Minimize/
    // Maximize/Close), which is gated on this same flag.
    usePlayerStore.getState().setIsFullscreen(true);
    playerSetFullscreen.mockRejectedValueOnce(new Error('Win32 error'));

    await setPlayerFullscreen(false);
    expect(usePlayerStore.getState().isFullscreen).toBe(false);
  });

  it('closePlayer always clears fullscreen regardless of the native round trip', () => {
    // Forced directly rather than left to the async setPlayerFullscreen
    // result — once the player is gone there is nothing left to be
    // fullscreen for, and the window chrome must be recoverable immediately.
    usePlayerStore.getState().setIsFullscreen(true);
    usePlayerStore.getState().closePlayer();
    expect(usePlayerStore.getState().isFullscreen).toBe(false);
  });
});
