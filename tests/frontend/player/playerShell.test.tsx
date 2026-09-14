// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  retryPlayback: vi.fn(),
  useMpvSession: vi.fn(),
}));
const actions = vi.hoisted(() => ({
  handleClose: vi.fn(),
  handleOverlayClick: vi.fn(),
}));

vi.mock('@/modules/playback/components/useMpvSession', () => ({
  useMpvSession: session.useMpvSession,
}));
vi.mock('@/modules/playback/components/usePlayerActions', () => ({
  usePlayerActions: () => actions,
}));
vi.mock('@/modules/playback/components/usePlayerChrome', () => ({
  usePlayerChrome: () => ({ setPointerOverChrome: vi.fn(), cursorStyle: 'default' }),
}));
vi.mock('@/modules/playback/components/useWatchProgress', () => ({
  useWatchProgress: () => vi.fn(),
}));
vi.mock('@/modules/playback/hooks/usePlayerContextMenus', () => ({
  usePlayerContextMenus: () => ({ handlePlayerContextMenu: vi.fn() }),
}));
vi.mock('@/modules/playback/components/VodControls', () => ({
  VodControls: () => <button>Normal player controls</button>,
}));
vi.mock('@/modules/playback/components/LiveControls', () => ({
  LiveControls: () => <button>Normal live controls</button>,
}));
vi.mock('@/modules/playback/components/FeedbackHud', () => ({
  FeedbackHud: () => <div>Stale pause feedback</div>,
}));
vi.mock('@/modules/playback/components/SeriesPlaybackPrompts', () => ({
  SeriesPlaybackPrompts: () => <div>Playback prompt</div>,
}));
vi.mock('@/modules/playback/components/EpisodesDrawer', () => ({
  EpisodesDrawer: () => <div>Episodes drawer</div>,
}));
vi.mock('@/modules/playback/components/ChannelsDrawer', () => ({
  ChannelsDrawer: () => <div>Channels drawer</div>,
}));

import { PlayerShell } from '@/modules/playback/components/PlayerShell';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useStreamVerificationStore } from '@/modules/sources/store/useStreamVerificationStore';

describe('player error interaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.useMpvSession.mockReturnValue({
      errorMessage: 'mpv error -5: HTTP 403 Forbidden',
      retryPlayback: session.retryPlayback,
      isRetrying: false,
    });
    act(() =>
      usePlayerStore.getState().playStream({
        id: 'movie-1',
        title: 'Movie',
        type: 'vod',
        streamUrl: 'https://media.test/movie',
      }),
    );
  });

  it('shows the exact playback failure without mounting click-through controls', () => {
    render(<PlayerShell />);

    expect(screen.getByText('mpv error -5: HTTP 403 Forbidden')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Normal player controls' })).toBeNull();
    expect(screen.queryByText('Stale pause feedback')).toBeNull();
    expect(screen.queryByText('Playback prompt')).toBeNull();

    fireEvent.click(screen.getByText('mpv error -5: HTTP 403 Forbidden'));
    expect(actions.handleOverlayClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(session.retryPlayback).toHaveBeenCalledOnce();
    expect(actions.handleOverlayClick).not.toHaveBeenCalled();
  });

  it('replaces the Twitch commercial interval with Movena status UI', () => {
    session.useMpvSession.mockReturnValue({
      errorMessage: null,
      retryPlayback: session.retryPlayback,
      isRetrying: false,
    });
    act(() =>
      usePlayerStore.getState().setResolverStatus(
        {
          provider: 'twitch',
          phase: 'ad-break',
          expectedDurationSeconds: 30,
        },
        usePlayerStore.getState().sessionId ?? undefined,
      ),
    );

    render(<PlayerShell />);

    expect(screen.getByText('Twitch ad blocked')).toBeTruthy();
    expect(screen.getByText('Live video resumes automatically.')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders a transparent buffering overlay during active playback without blocking video frames', () => {
    session.useMpvSession.mockReturnValue({
      errorMessage: null,
      retryPlayback: session.retryPlayback,
      isRetrying: false,
    });
    act(() => {
      usePlayerStore.setState({
        isVideoReady: true,
        isBuffering: true,
      });
    });

    const { container } = render(<PlayerShell />);
    const overlay = container.querySelector('[class*="loadingOverlay"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.className).toContain('loadingOverlayBuffering');
  });

  it('shows only the verified resolution badge when it disagrees with the channel-declared one', () => {
    session.useMpvSession.mockReturnValue({
      errorMessage: null,
      retryPlayback: session.retryPlayback,
      isRetrying: false,
    });
    act(() =>
      usePlayerStore.getState().playStream({
        id: 'channel-1',
        title: 'Sports 4K',
        type: 'live',
        streamUrl: 'https://media.test/live',
      }),
    );
    act(() =>
      useStreamVerificationStore.getState().recordVerification('channel-1', {
        width: 1920,
        height: 1080,
        fps: 30,
      }),
    );

    render(<PlayerShell />);

    // The channel's own name claims 4K, but the actually-decoded video is
    // 1080p — only the verified badge should show, not both.
    expect(screen.getByText('FHD')).toBeTruthy();
    expect(screen.queryByText('4K')).toBeNull();
  });
});
