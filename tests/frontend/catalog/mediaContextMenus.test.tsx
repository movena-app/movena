// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildLogoAspectMenuItem,
  useMediaContextMenus,
} from '@/modules/catalog/hooks/useMediaContextMenus';
import { useContextMenuStore } from '@/shared/ui/context-menu/useContextMenuStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const { downloadMediaItemMock } = vi.hoisted(() => ({
  downloadMediaItemMock: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/modules/downloads/services/mediaDownload', () => ({
  downloadMediaItem: downloadMediaItemMock,
}));

beforeEach(() => {
  downloadMediaItemMock.mockClear();
  useContextMenuStore.getState().closeContextMenu();
});

describe('media download actions', () => {
  it('builds source-scoped logo overrides while honoring a legacy fallback', () => {
    const setOverride = vi.fn();
    const menu = buildLogoAspectMenuItem(
      { id: 'fallback-id', sourceId: 'source-a', sourceItemId: 'channel-7' },
      (message) => message,
      {
        channelLogoAspectOverrides: { 'channel-7': '4:3' },
        setChannelLogoAspectOverride: setOverride,
      },
    );

    expect(menu.submenu?.find((item) => item.id === 'aspect-4-3')?.checked).toBe(true);
    menu.submenu?.find((item) => item.id === 'aspect-original')?.action?.();
    expect(setOverride).toHaveBeenCalledWith('source-a::channel-7', 'original');
  });

  it('offers download for playable VOD and episode items', () => {
    const { result } = renderHook(() => useMediaContextMenus());
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent;

    result.current.handleMediaCardContextMenu(event, {
      id: 'episode-1',
      title: 'Series - S01E01',
      posterUrl: '',
      type: 'series',
      streamUrl: 'https://media.test/episode.mp4',
    });

    const downloadItem = useContextMenuStore
      .getState()
      .items.find((item) => item.id === 'download');
    expect(downloadItem?.label).toBe('Download Content');
    downloadItem?.action?.();
    expect(downloadMediaItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Series - S01E01',
        streamUrl: 'https://media.test/episode.mp4',
      }),
    );
  });

  it('does not offer downloads for live channels or catalogue-only series cards', () => {
    const { result } = renderHook(() => useMediaContextMenus());
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent;

    result.current.handleMediaCardContextMenu(event, {
      id: 'live-1',
      title: 'Channel',
      posterUrl: '',
      type: 'live',
      streamUrl: 'https://media.test/live.m3u8',
    });
    expect(useContextMenuStore.getState().items.some((item) => item.id === 'download')).toBe(false);

    result.current.handleMediaCardContextMenu(event, {
      id: 'series-1',
      title: 'Series',
      posterUrl: '',
      type: 'series',
    });
    expect(useContextMenuStore.getState().items.some((item) => item.id === 'download')).toBe(false);
    expect(useContextMenuStore.getState().items.some((item) => item.id === 'play')).toBe(false);
    expect(useContextMenuStore.getState().items.find((item) => item.id === 'copy-url')?.label).toBe(
      'Copy Title',
    );
  });

  it('offers Logo Aspect Ratio submenu for Live TV items and updates override', () => {
    const { result } = renderHook(() => useMediaContextMenus());
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent;

    result.current.handleMediaCardContextMenu(event, {
      id: 'channel-arena-3',
      title: 'Arena Sport 3',
      posterUrl: 'https://example.com/arena.png',
      type: 'live',
    });

    const aspectMenu = useContextMenuStore
      .getState()
      .items.find((item) => item.id === 'logo-aspect-submenu');
    expect(aspectMenu).toBeDefined();
    expect(aspectMenu?.label).toBe('Logo Aspect Ratio');
    expect(aspectMenu?.submenu).toHaveLength(4);

    // Pick 16:9 widescreen
    const widescreenOption = aspectMenu?.submenu?.find((s) => s.id === 'aspect-16-9');
    expect(widescreenOption).toBeDefined();
    widescreenOption?.action?.();
    expect(useSettingsStore.getState().channelLogoAspectOverrides['channel-arena-3']).toBe('16:9');
  });
});
