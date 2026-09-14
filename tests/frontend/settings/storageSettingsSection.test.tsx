// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { StorageSettingsSection } from '@/modules/settings/components/StorageSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('StorageSettingsSection', () => {
  it('updates recording and download settings', () => {
    render(<StorageSettingsSection />);

    const recordingInput = screen.getByLabelText('Recording save folder');
    fireEvent.change(recordingInput, { target: { value: 'Custom Recordings' } });
    expect(useSettingsStore.getState().recordingPath).toBe('Custom Recordings');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Quick Record button' }));
    expect(useSettingsStore.getState().instantRecord).toBe(true);

    const downloadsInput = screen.getByLabelText('Download save folder');
    fireEvent.change(downloadsInput, { target: { value: 'D:\\Downloads' } });
    expect(useSettingsStore.getState().downloadDirectory).toBe('D:\\Downloads');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Start downloads automatically' }));
    expect(useSettingsStore.getState().autoStartDownloads).toBe(false);
  });
});
