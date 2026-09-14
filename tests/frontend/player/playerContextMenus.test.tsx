// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerContextMenus } from '@/modules/playback/hooks/usePlayerContextMenus';
import { useContextMenuStore } from '@/shared/ui/context-menu/useContextMenuStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useContextMenuStore.getState().closeContextMenu();
});

describe('Player Context Menu Developer HUD option', () => {
  it('adds Debug HUD toggles when debugMode is active', () => {
    // 1. Enable developer mode
    useSettingsStore.getState().updateSetting('debugMode', true);
    useSettingsStore.getState().updateSetting('showDebugOverlay', false);

    const { result } = renderHook(() => usePlayerContextMenus());

    // Trigger player context menu
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent;

    result.current.handlePlayerContextMenu(mockEvent);

    const menuState = useContextMenuStore.getState();
    expect(menuState.isOpen).toBe(true);

    // Verify presence of developer HUD toggle
    const debugItem = menuState.items.find((item) => item.id === 'debug');
    expect(debugItem).toBeDefined();
    expect(debugItem?.label).toBe('Show Developer HUD');

    // Run toggle action
    debugItem?.action?.();
    expect(useSettingsStore.getState().showDebugOverlay).toBe(true);
  });

  it('excludes Debug HUD toggles when debugMode is disabled', () => {
    // 1. Disable developer mode
    useSettingsStore.getState().updateSetting('debugMode', false);

    const { result } = renderHook(() => usePlayerContextMenus());

    // Trigger player context menu
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent;

    result.current.handlePlayerContextMenu(mockEvent);

    const menuState = useContextMenuStore.getState();
    expect(menuState.isOpen).toBe(true);

    // Verify absence of developer HUD toggle
    const debugItem = menuState.items.find((item) => item.id === 'debug');
    expect(debugItem).toBeUndefined();
  });

  it('excludes the app-backdrop Debug HUD toggle when debugMode is disabled', () => {
    useSettingsStore.getState().updateSetting('debugMode', false);

    const { result } = renderHook(() => usePlayerContextMenus());
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
      clientY: 200,
      target: document.createElement('div'),
    } as unknown as React.MouseEvent;

    result.current.handleAppBackdropContextMenu(mockEvent);

    const debugItem = useContextMenuStore.getState().items.find((item) => item.id === 'debug');
    expect(debugItem).toBeUndefined();
  });

  it('adds the app-backdrop Debug HUD toggle when debugMode is enabled', () => {
    useSettingsStore.getState().updateSetting('debugMode', true);
    useSettingsStore.getState().updateSetting('showDebugOverlay', false);

    const { result } = renderHook(() => usePlayerContextMenus());
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
      clientY: 200,
      target: document.createElement('div'),
    } as unknown as React.MouseEvent;

    result.current.handleAppBackdropContextMenu(mockEvent);

    const debugItem = useContextMenuStore.getState().items.find((item) => item.id === 'debug');
    expect(debugItem?.label).toBe('Show Debug HUD');
  });
});
