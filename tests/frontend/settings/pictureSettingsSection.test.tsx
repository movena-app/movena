// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PictureSettingsSection } from '@/modules/settings/components/PictureSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('PictureSettingsSection', () => {
  it('changes brightness and resets adjustments', () => {
    render(<PictureSettingsSection />);

    const brightnessSlider = screen.getByRole('slider', { name: 'Brightness' });
    fireEvent.change(brightnessSlider, { target: { value: '120' } });
    expect(useSettingsStore.getState().imageBrightness).toBe(120);

    const resetButton = screen.getByRole('button', { name: 'Reset Picture' });
    expect(resetButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(resetButton);

    expect(useSettingsStore.getState().imageBrightness).toBe(100);
  });
});
