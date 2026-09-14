// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GeneralSettingsSection } from '@/modules/settings/components/GeneralSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('GeneralSettingsSection', () => {
  it('toggles always on top and collapsed sidebar badges', () => {
    render(<GeneralSettingsSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep Movena window on top' }));
    expect(useSettingsStore.getState().alwaysOnTop).toBe(true);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Show library counts in collapsed sidebar' }),
    );
    expect(useSettingsStore.getState().showCollapsedSidebarBadges).toBe(false);
  });

  it('changes motion preference', () => {
    render(<GeneralSettingsSection />);

    fireEvent.click(screen.getByRole('radio', { name: 'Reduced' }));
    expect(useSettingsStore.getState().motionPreference).toBe('reduced');
  });

  it('toggles automatically check for updates', () => {
    render(<GeneralSettingsSection />);

    expect(useSettingsStore.getState().autoCheckUpdates).toBe(true);
    const toggle = screen.getByRole('checkbox', { name: 'Automatically check for updates' });

    fireEvent.click(toggle);
    expect(useSettingsStore.getState().autoCheckUpdates).toBe(false);
  });
});
