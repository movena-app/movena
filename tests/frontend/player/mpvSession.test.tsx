// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  mpvSetProperty: vi.fn(),
  mpvStart: vi.fn(),
  mpvStop: vi.fn(),
}));
const desktop = vi.hoisted(() => ({ isDesktop: vi.fn(() => true), onMpvEvent: vi.fn() }));
const debug = vi.hoisted(() => ({
  debugLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const notifications = vi.hoisted(() => ({
  notify: { warning: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/platform/desktop', () => ({ desktopApi: desktop }));
vi.mock('@/platform/tauri', () => ({ tauriApi: native }));
vi.mock('@/modules/playback/components/aspect', () => ({
  applyAspectRatio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/playback/components/imageSettings', () => ({
  applyImageAdjustments: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/playback/components/fullscreen', () => ({
  setPlayerFullscreen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/diagnostics/store/useDebugStore', () => debug);
vi.mock('@/shared/notifications/useNotificationStore', () => notifications);

import { useMpvSession } from '@/modules/playback/components/useMpvSession';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

let eventHandler:
  ((event: { type: string; name?: string; data?: unknown; sessionId?: string }) => void) | null =
  null;
const unlisten = vi.fn();

const stream = {
  id: 'movie-1',
  title: 'Movie',
  type: 'vod' as const,
  streamUrl: 'https://primary.test/movie.mp4',
  startPosition: 42,
  fallbacks: [{ streamUrl: 'https://backup.test/movie.mp4' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  native.mpvStart.mockResolvedValue(undefined);
  native.mpvStop.mockResolvedValue(undefined);
  native.mpvSetProperty.mockResolvedValue(undefined);
  desktop.onMpvEvent.mockImplementation(async (handler: typeof eventHandler) => {
    eventHandler = handler;
    return unlisten;
  });
  eventHandler = null;
  usePlayerStore.getState().closePlayer();
  useSettingsStore.getState().resetSettings();
});

describe('native MPV session lifecycle', () => {
  it('starts only after the event listener is installed and passes the session settings', async () => {
    act(() => usePlayerStore.getState().playStream(stream));
    const { unmount } = renderHook(() => useMpvSession());

    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));
    expect(eventHandler).not.toBeNull();
    expect(native.mpvStart).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: usePlayerStore.getState().sessionId,
        url: stream.streamUrl,
        startPosition: 42,
        hwdec: 'auto-safe',
        cacheSecs: 30,
      }),
    );

    act(() =>
      eventHandler?.({
        type: 'property-change',
        name: 'vo-configured',
        data: true,
        sessionId: 'stale',
      }),
    );
    expect(usePlayerStore.getState().isVideoReady).toBe(false);
    act(() =>
      eventHandler?.({
        type: 'property-change',
        name: 'vo-configured',
        data: true,
        sessionId: usePlayerStore.getState().sessionId!,
      }),
    );
    expect(usePlayerStore.getState().isVideoReady).toBe(true);

    unmount();
    await waitFor(() => expect(native.mpvStop).toHaveBeenCalledTimes(1));
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('switches to the next fallback after a confirmed end-file error', async () => {
    native.mpvStart.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    act(() => usePlayerStore.getState().playStream(stream));
    const { unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error', errorCode: -1 },
        sessionId: usePlayerStore.getState().sessionId!,
      }),
    );
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(2));
    expect(native.mpvStart.mock.calls[1]![0]).toMatchObject({
      url: 'https://backup.test/movie.mp4',
      startPosition: 42,
    });
    expect(notifications.notify.warning).toHaveBeenCalledWith(
      'Trying Alternate Source',
      expect.any(String),
      undefined,
      undefined,
      'playback',
    );

    unmount();
  });

  it('uses a newly reduced failover budget instead of a stale settings closure', async () => {
    useSettingsStore.getState().updateSetting('maxStreamFailovers', 0);
    act(() => usePlayerStore.getState().playStream(stream));
    const { unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() => useSettingsStore.getState().updateSetting('maxStreamFailovers', 1));
    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error' },
        sessionId: usePlayerStore.getState().sessionId!,
      }),
    );
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(2));

    unmount();
  });

  it('exposes the exact mpv error when no fallback remains', async () => {
    act(() => usePlayerStore.getState().playStream({ ...stream, fallbacks: [] }));
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error', errorCode: -5, errorMessage: 'HTTP 403 Forbidden' },
        sessionId: usePlayerStore.getState().sessionId!,
      }),
    );

    expect(result.current.errorMessage).toBe('mpv error -5: HTTP 403 Forbidden');
    unmount();
  });

  it('surfaces an offline YouTube channel instead of mpv format error -17', async () => {
    act(() =>
      usePlayerStore.getState().playStream({
        ...stream,
        streamUrl: 'https://www.youtube.com/user/encuentro/live',
        fallbacks: [],
      }),
    );
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));
    const sessionId = usePlayerStore.getState().sessionId!;

    act(() =>
      eventHandler?.({
        type: 'log-message',
        data: {
          prefix: 'ytdl_hook',
          level: 'error',
          text: 'ERROR: [youtube:tab] encuentro: The channel is not currently live',
        },
        sessionId,
      }),
    );
    act(() =>
      eventHandler?.({
        type: 'log-message',
        data: {
          prefix: 'ytdl_hook',
          level: 'error',
          text: 'youtube-dl failed: unexpected error occurred',
        },
        sessionId,
      }),
    );
    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error', errorCode: -17, errorMessage: 'unrecognized file format' },
        sessionId,
      }),
    );

    expect(result.current.errorMessage).toBe('This channel is not currently live.');
    unmount();
  });

  it('retains every technical failure when the primary and fallback both fail', async () => {
    act(() => usePlayerStore.getState().playStream(stream));
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error', errorCode: -5, errorMessage: 'Primary returned HTTP 503' },
        sessionId: usePlayerStore.getState().sessionId!,
      }),
    );
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(2));

    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error', errorCode: -6, errorMessage: 'Fallback returned HTTP 404' },
        sessionId: usePlayerStore.getState().sessionId!,
      }),
    );

    expect(result.current.errorMessage).toBe(
      'mpv error -5: Primary returned HTTP 503\nmpv error -6: Fallback returned HTTP 404',
    );
    unmount();
  });

  it('surfaces an offline Twitch channel instead of a resolver timeout', async () => {
    act(() =>
      usePlayerStore.getState().playStream({
        ...stream,
        type: 'live',
        streamUrl: 'https://www.twitch.tv/gleggmire',
        startPosition: 0,
        fallbacks: [],
      }),
    );
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));
    const sessionId = usePlayerStore.getState().sessionId!;

    act(() =>
      eventHandler?.({
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'failed', code: 'channel-offline' },
        sessionId,
      }),
    );
    act(() =>
      eventHandler?.({
        type: 'end-file',
        data: { reason: 'error', errorCode: -5, errorMessage: 'resolver exited' },
        sessionId,
      }),
    );

    expect(result.current.errorMessage).toBe('This Twitch channel is not currently live.');
    unmount();
  });

  it('isolates Twitch resolver events by session and suspends the ordinary stall watchdog', async () => {
    act(() =>
      usePlayerStore.getState().playStream({
        ...stream,
        type: 'live',
        streamUrl: 'https://www.twitch.tv/gleggmire',
        startPosition: 0,
        fallbacks: [],
      }),
    );
    const { unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));
    const sessionId = usePlayerStore.getState().sessionId!;

    act(() =>
      eventHandler?.({
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'ad-break', expectedDurationSeconds: 30 },
        sessionId: 'stale-session',
      }),
    );
    expect(usePlayerStore.getState().resolverStatus).toBeNull();

    vi.useFakeTimers();
    act(() =>
      eventHandler?.({
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'ad-break', expectedDurationSeconds: 30 },
        sessionId,
      }),
    );
    act(() =>
      eventHandler?.({
        type: 'property-change',
        name: 'paused-for-cache',
        data: true,
        sessionId,
      }),
    );
    act(() => vi.advanceTimersByTime(20_000));
    expect(native.mpvStart).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().resolverStatus?.phase).toBe('ad-break');

    act(() =>
      eventHandler?.({
        type: 'property-change',
        name: 'time-pos',
        data: 1,
        sessionId,
      }),
    );
    expect(usePlayerStore.getState().resolverStatus).toBeNull();
    unmount();
    vi.useRealTimers();
  });

  it('restarts one stuck Twitch break and then surfaces an explicit error', async () => {
    act(() =>
      usePlayerStore.getState().playStream({
        ...stream,
        type: 'live',
        streamUrl: 'https://www.twitch.tv/gleggmire',
        startPosition: 0,
        fallbacks: [],
      }),
    );
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    let sessionId = usePlayerStore.getState().sessionId!;

    act(() =>
      eventHandler?.({
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'ad-break', expectedDurationSeconds: 1 },
        sessionId,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve();
    });
    expect(native.mpvStart).toHaveBeenCalledTimes(2);

    sessionId = usePlayerStore.getState().sessionId!;
    act(() =>
      eventHandler?.({
        type: 'resolver-status',
        data: { provider: 'twitch', phase: 'ad-break', expectedDurationSeconds: 1 },
        sessionId,
      }),
    );
    act(() => vi.advanceTimersByTime(31_000));
    expect(result.current.errorMessage).toBe(
      'Twitch did not resume the live stream after the filtered commercial break.',
    );
    expect(native.mpvStart).toHaveBeenCalledTimes(2);
    unmount();
    vi.useRealTimers();
  });
});
