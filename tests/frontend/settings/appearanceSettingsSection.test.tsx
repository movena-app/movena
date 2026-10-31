// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppearanceSettingsSection } from '@/modules/settings/components/AppearanceSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('AppearanceSettingsSection', () => {
  it('exposes an accessible dark and light theme preference', () => {
    render(<AppearanceSettingsSection />);

    expect(screen.getByRole('radiogroup', { name: 'Interface theme' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));

    expect(useSettingsStore.getState().themePreference).toBe('light');
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
  });

  it('lets the user opt out of seasonal themes', () => {
    render(<AppearanceSettingsSection />);

    const toggle = screen.getByRole('checkbox', { name: 'Use seasonal themes' });
    expect((toggle as HTMLInputElement).checked).toBe(true);

    fireEvent.click(toggle);

    expect(useSettingsStore.getState().seasonalThemes).toBe(false);
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });
});
