// @vitest-environment happy-dom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  mpvPlayPause: vi.fn(),
  mpvSeekRelative: vi.fn(),
  mpvSetVolume: vi.fn(),
}));
const fullscreen = vi.hoisted(() => ({
  toggleWindowFullscreen: vi.fn(),
  setPlayerFullscreen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/platform/tauri', () => ({ tauriApi: native }));
vi.mock('@/modules/playback/components/fullscreen', () => fullscreen);

import { usePlayerActions } from '@/modules/playback/components/usePlayerActions';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const vod = {
  id: 'vod-1',
  title: 'Movie',
  type: 'vod' as const,
  streamUrl: 'https://media.test/movie',
};
const live = {
  id: 'live-1',
  title: 'Channel',
  type: 'live' as const,
  streamUrl: 'https://media.test/live',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  native.mpvPlayPause.mockResolvedValue(undefined);
  native.mpvSeekRelative.mockResolvedValue(undefined);
  native.mpvSetVolume.mockResolvedValue(undefined);
  fullscreen.toggleWindowFullscreen.mockClear();
  fullscreen.setPlayerFullscreen.mockClear();
  usePlayerStore.getState().closePlayer();
  useSettingsStore.getState().resetSettings();
});

afterEach(() => vi.useRealTimers());

describe('player keyboard and pointer actions', () => {
  it('seeks VOD with the configured jump but never seeks live channels', async () => {
    const save = vi.fn();
    act(() => usePlayerStore.getState().playStream(vod));
    const { rerender } = renderHook(
      ({ stream }: { stream: typeof vod | typeof live }) => usePlayerActions(stream, save),
      { initialProps: { stream: vod as typeof vod | typeof live } },
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(native.mpvSeekRelative).toHaveBeenNthCalledWith(1, 10);
    expect(native.mpvSeekRelative).toHaveBeenNthCalledWith(2, -10);

    act(() => usePlayerStore.getState().playStream(live));
    rerender({ stream: live });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(native.mpvSeekRelative).toHaveBeenCalledTimes(2);
  });

  it('ignores editable fields and closes through Escape only after popovers/drawers', () => {
    const save = vi.fn();
    act(() => usePlayerStore.getState().playStream(vod));
    const { result } = renderHook(() => usePlayerActions(vod, save));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(native.mpvSeekRelative).not.toHaveBeenCalled();

    act(() => usePlayerStore.getState().setActivePopover('speed'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(usePlayerStore.getState().activePopover).toBeNull();
    expect(save).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(save).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().activeStream).toBeNull();
    expect(result.current.handleClose).toBeTypeOf('function');
    input.remove();
  });

  it('leaves fullscreen on Escape instead of closing the player', () => {
    const save = vi.fn();
    act(() => usePlayerStore.getState().playStream(vod));
    act(() => usePlayerStore.getState().setIsFullscreen(true));
    renderHook(() => usePlayerActions(vod, save));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fullscreen.setPlayerFullscreen).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().activeStream).not.toBeNull();

    // A second Escape, now windowed, closes as before.
    act(() => usePlayerStore.getState().setIsFullscreen(false));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(save).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().activeStream).toBeNull();
  });

  it('lets Escape through a focused seekbar/slider while still guarding other shortcuts', () => {
    const save = vi.fn();
    act(() => usePlayerStore.getState().playStream(vod));
    act(() => usePlayerStore.getState().setIsFullscreen(true));
    renderHook(() => usePlayerActions(vod, save));

    // The seekbar (and volume/image sliders) are <input type="range">
    // elements that keep native focus after a drag or click.
    const seekbar = document.createElement('input');
    seekbar.type = 'range';
    document.body.appendChild(seekbar);
    seekbar.focus();

    fireEvent.keyDown(seekbar, { key: 'ArrowRight' });
    expect(native.mpvSeekRelative).not.toHaveBeenCalled();

    fireEvent.keyDown(seekbar, { key: 'Escape' });
    expect(fullscreen.setPlayerFullscreen).toHaveBeenCalledWith(false);
    expect(usePlayerStore.getState().activeStream).not.toBeNull();

    seekbar.remove();
  });

  it('treats two overlay clicks as fullscreen and one click as play/pause', async () => {
    const save = vi.fn();
    act(() => usePlayerStore.getState().playStream(vod));
    const { result } = renderHook(() => usePlayerActions(vod, save));

    act(() => result.current.handleOverlayClick());
    await act(async () => vi.advanceTimersByTimeAsync(220));
    expect(native.mpvPlayPause).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleOverlayClick();
      result.current.handleOverlayClick();
    });
    expect(fullscreen.toggleWindowFullscreen).toHaveBeenCalledTimes(1);
  });

  it('blocks playback shortcuts and overlay clicks while an error owns the player', async () => {
    const save = vi.fn();
    act(() => usePlayerStore.getState().playStream(vod));
    const { result } = renderHook(() => usePlayerActions(vod, save, true));

    act(() => result.current.handleOverlayClick());
    fireEvent.keyDown(window, { key: ' ' });
    await act(async () => vi.advanceTimersByTimeAsync(220));
    expect(native.mpvPlayPause).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(save).toHaveBeenCalledOnce();
  });
});
