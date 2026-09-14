// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubtitleAudioSettingsSection } from '@/modules/settings/components/SubtitleAudioSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('SubtitleAudioSettingsSection', () => {
  it('toggles subtitles by default and changes subtitle font size', () => {
    render(<SubtitleAudioSettingsSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable subtitles by default' }));
    expect(useSettingsStore.getState().subtitlesEnabled).toBe(false);

    const sizeInput = screen.getByDisplayValue('38');
    fireEvent.change(sizeInput, { target: { value: '42' } });
    expect(useSettingsStore.getState().subtitleFontSize).toBe(42);
  });

  it('changes playback speed', () => {
    render(<SubtitleAudioSettingsSection />);

    fireEvent.click(screen.getByRole('radio', { name: '1.25×' }));
    expect(useSettingsStore.getState().rememberedPlaybackSpeed).toBe(1.25);
  });
});
