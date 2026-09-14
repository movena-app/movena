// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DebugOverlay } from '@/modules/diagnostics/components/DebugOverlay';
import { useDebugStore } from '@/modules/diagnostics/store/useDebugStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

function renderHud() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DebugOverlay />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useSettingsStore.getState().updateSetting('debugMode', true);
  useSettingsStore.getState().updateSetting('showDebugOverlay', true);
  useDebugStore.setState({ logs: [], networkLogs: [] });
  usePlayerStore.getState().closePlayer();
});

describe('Developer HUD', () => {
  it('provides bounded keyboard resizing and a reset affordance', async () => {
    renderHud();
    const user = userEvent.setup();
    const hud = screen.getByRole('region', { name: 'Developer HUD' });
    const resizeHandle = screen.getByRole('button', {
      name: 'Resize Developer HUD. Use arrow keys; Home resets.',
    });

    expect(hud.style.width).toBe('680px');
    expect(hud.style.height).toBe('520px');

    resizeHandle.focus();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(hud.style.width).toBe('664px');
    expect(hud.style.height).toBe('504px');

    await user.keyboard('{Home}');
    expect(hud.style.width).toBe('680px');
    expect(hud.style.height).toBe('520px');

    let capturedPointer: number | null = null;
    resizeHandle.setPointerCapture = (pointerId) => {
      capturedPointer = pointerId;
    };
    resizeHandle.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    resizeHandle.releasePointerCapture = () => {
      capturedPointer = null;
    };
    fireEvent.pointerDown(resizeHandle, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resizeHandle, { pointerId: 1, clientX: 132, clientY: 148 });
    fireEvent.pointerUp(resizeHandle, { pointerId: 1, clientX: 132, clientY: 148 });

    expect(hud.style.width).toBe('712px');
    expect(hud.style.height).toBe('568px');
  });

  it('exposes accessible tabs and expands structured log details', async () => {
    useDebugStore.getState().addLog('error', 'search', 'Search index failed', {
      reason: 'needle in payload',
    });
    renderHud();
    const user = userEvent.setup();

    expect(screen.getByRole('tablist', { name: 'Developer HUD sections' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Logs 1' }));
    const logRow = screen.getByRole('button', { name: /Search index failed/ });
    expect(logRow.getAttribute('aria-expanded')).toBe('false');
    await user.click(logRow);

    expect(logRow.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/needle in payload/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All Categories' })).toBeTruthy();
  });

  it('searches structured details and pauses the live log feed', async () => {
    useDebugStore.getState().addLog('info', 'system', 'First event', { correlation: 'find-me' });
    useDebugStore.getState().addLog('info', 'system', 'Second event');
    renderHud();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Logs 2' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search diagnostic logs' }), 'find-me');
    expect(screen.getByText('Showing 1 of 2')).toBeTruthy();

    await user.clear(screen.getByRole('searchbox', { name: 'Search diagnostic logs' }));
    await user.click(screen.getByRole('button', { name: 'Pause live logs' }));
    useDebugStore.getState().addLog('error', 'system', 'Arrived while paused');

    expect(await screen.findByText('1 new while paused')).toBeTruthy();
    expect(screen.queryByText('Arrived while paused')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Resume live logs' }));
    expect(await screen.findByText('Arrived while paused')).toBeTruthy();
  });

  it('navigates from overview error totals into filtered logs', async () => {
    useDebugStore.getState().addLog('error', 'system', 'Broken state');
    renderHud();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Errors 1/ }));
    expect(screen.getByRole('tab', { name: 'Logs 1' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Error' })).toBeTruthy();
    expect(screen.getByText('Broken state')).toBeTruthy();
  });

  it('shows bounded native playback quality and pipeline diagnostics', async () => {
    const player = usePlayerStore.getState();
    player.playStream({
      id: 'movie',
      title: 'Movie',
      type: 'vod',
      streamUrl: 'https://example.test',
    });
    player.setTrackList([
      { id: 1, type: 'video', selected: true, codec: 'hevc', 'codec-profile': 'Main 10' },
      { id: 2, type: 'audio', selected: true, codec: 'aac' },
    ]);
    player.updateFromMpvEvent('vo-configured', true);
    player.updateFromMpvEvent('diagnostic-sample', {
      'hwdec-current': 'd3d11va',
      'video-params': { w: 3840, h: 2160, 'hw-pixelformat': 'p010', primaries: 'bt.2020' },
      'audio-params': { format: 'float', samplerate: 48000, channels: '5.1' },
      'demuxer-cache-duration': 12.5,
      'cache-speed': 2_000_000,
      'video-bitrate': 8_000_000,
      'audio-bitrate': 192_000,
      'estimated-vf-fps': 23.976,
      avsync: 0.002,
      'frame-drop-count': 3,
    });
    renderHud();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Player' }));

    expect(screen.getAllByText('12.5 s')).toHaveLength(2);
    expect(screen.getByText('d3d11va')).toBeTruthy();
    expect(screen.getByText('3840×2160')).toBeTruthy();
    expect(screen.getByText(/hevc · Main 10/)).toBeTruthy();
    expect(screen.getByText('1/60 samples')).toBeTruthy();
  });
});
