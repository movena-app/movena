// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryMetadataSettingsSection } from '@/modules/settings/components/LibraryMetadataSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useSettingsStore.setState({
    tmdbApiKey: 'test-key',
    tmdbEnabled: true,
    streamFoldingEnabled: true,
  });
});

describe('library and metadata settings', () => {
  it('toggles stream folding and tmdb enrichment', () => {
    render(<LibraryMetadataSettingsSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable live stream folding' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable TMDB enrichment' }));

    expect(useSettingsStore.getState().streamFoldingEnabled).toBe(false);
    expect(useSettingsStore.getState().tmdbEnabled).toBe(false);
  });

  it('toggles quality and format badges', () => {
    render(<LibraryMetadataSettingsSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show quality and format badges' }));

    expect(useSettingsStore.getState().badgeVisibility.resolution).toBe(false);
    expect(useSettingsStore.getState().badgeVisibility.fps).toBe(false);
    expect(useSettingsStore.getState().badgeVisibility.audio).toBe(false);
    expect(useSettingsStore.getState().badgeVisibility.edition).toBe(false);
  });

  it('disables subordinate controls when TMDB is turned off', () => {
    useSettingsStore.setState({ tmdbEnabled: false });
    render(<LibraryMetadataSettingsSection />);

    expect(
      screen.getByRole('checkbox', { name: 'Include adult TMDB results' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'TMDB metadata language' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'TMDB poster quality' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
