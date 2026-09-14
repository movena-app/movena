// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeSettingsSection } from '@/modules/settings/components/HomeSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { DEFAULT_HOME_SECTIONS } from '@/modules/catalog/lib/homeSections';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('Home layout settings', () => {
  it('toggles a row off and back on', async () => {
    const user = userEvent.setup();
    render(<HomeSettingsSection />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Show Recently Added Movies',
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await user.click(checkbox);
    expect(useSettingsStore.getState().homeSections.find((s) => s.id === 'recentMovies')).toEqual({
      id: 'recentMovies',
      enabled: false,
    });

    await user.click(checkbox);
    expect(useSettingsStore.getState().homeSections.find((s) => s.id === 'recentMovies')).toEqual({
      id: 'recentMovies',
      enabled: true,
    });
  });

  it('moves a row down and its neighbor up in response', async () => {
    const user = userEvent.setup();
    render(<HomeSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Move Coming Up down' }));

    expect(useSettingsStore.getState().homeSections.map((s) => s.id)).toEqual([
      'continueWatching',
      'upcoming',
      'recentMovies',
      'recentSeries',
      'popularMovies',
      'popularSeries',
      'liveChannels',
    ]);
  });

  it('disables the up arrow for the first row and the down arrow for the last row', () => {
    render(<HomeSettingsSection />);

    expect(screen.getByRole('button', { name: 'Move Coming Up up' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getByRole('button', { name: 'Move Live TV Channels down' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('does not offer a visibility toggle for Coming Up, which is controlled elsewhere', () => {
    render(<HomeSettingsSection />);
    expect(screen.queryByRole('checkbox', { name: 'Show Coming Up' })).toBeNull();
    expect(screen.getByText(/Show on Home/)).toBeTruthy();
  });

  it('restores the default order and visibility on reset', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({
      homeSections: [
        { id: 'liveChannels', enabled: false },
        ...DEFAULT_HOME_SECTIONS.filter((s) => s.id !== 'liveChannels'),
      ],
    });
    render(<HomeSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Reset to Default' }));

    expect(useSettingsStore.getState().homeSections).toEqual(DEFAULT_HOME_SECTIONS);
  });
});
