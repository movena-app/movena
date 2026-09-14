// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { M3uEditorSettings } from '@/modules/settings/components/M3uEditorSettings';
import { migrateSettingsState, useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(migrateSettingsState({}));
});

describe('M3uEditorSettings', () => {
  it('persists draft, safety, preservation, and native probe defaults', () => {
    render(<M3uEditorSettings />);
    expect(screen.getByRole('heading', { name: 'Playlist Editor Defaults' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Autosave M3U editor drafts'));
    fireEvent.click(screen.getByLabelText('Preserve unknown M3U tags'));
    fireEvent.change(screen.getByLabelText('Stream probe timeout in seconds'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Parallel stream probes'), { target: { value: '8' } });

    const state = useSettingsStore.getState();
    expect(state.m3uEditorAutosaveDrafts).toBe(false);
    expect(state.m3uPreserveUnknownTags).toBe(false);
    expect(state.m3uHealthTimeoutMs).toBe(12_000);
    expect(state.m3uHealthConcurrency).toBe(8);
  });
});
