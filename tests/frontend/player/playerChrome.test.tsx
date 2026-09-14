// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerChrome } from '@/modules/playback/components/usePlayerChrome';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

vi.mock('@/modules/playback/components/fullscreen', () => ({
  setCursorHidden: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

describe('usePlayerChrome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      activeStream: {
        id: 'test-stream',
        title: 'Test Stream',
        type: 'live',
        streamUrl: 'http://test/stream.m3u8',
      },
      isPlaying: true,
      isVideoReady: true,
      isBuffering: false,
      showControls: true,
      showEpisodesDrawer: false,
      showChannelsDrawer: false,
      activePopover: null,
    });
  });

  it('auto-hides controls after 3 seconds of inactivity during normal playback', () => {
    renderHook(() => usePlayerChrome(true));

    expect(usePlayerStore.getState().showControls).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(usePlayerStore.getState().showControls).toBe(false);
  });

  it('keeps controls visible when the episodes drawer is open', () => {
    usePlayerStore.setState({ showEpisodesDrawer: true });
    renderHook(() => usePlayerChrome(true));

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(usePlayerStore.getState().showControls).toBe(true);
  });

  it('keeps controls visible when the channels drawer is open', () => {
    usePlayerStore.setState({ showChannelsDrawer: true });
    renderHook(() => usePlayerChrome(true));

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(usePlayerStore.getState().showControls).toBe(true);
  });
});
