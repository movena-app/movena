// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ComingUpSettingsSection } from '@/modules/settings/components/ComingUpSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useSettingsStore.setState({
    tmdbApiKey: 'test-key',
    tmdbEnabled: true,
    upcomingEnabled: true,
    upcomingHomeEnabled: true,
    upcomingCountdownEnabled: true,
    upcomingCalendarEnabled: true,
    upcomingExactTimesEnabled: true,
    upcomingHistoryDays: 7,
  });
});

describe('release schedule settings', () => {
  it('persists each independent presentation preference', async () => {
    const user = userEvent.setup();
    render(<ComingUpSettingsSection />);

    await user.click(screen.getByRole('checkbox', { name: 'Show Coming Up on Home' }));
    await user.click(screen.getByRole('checkbox', { name: 'Show live release countdowns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Show release calendar' }));
    await user.click(screen.getByRole('checkbox', { name: 'Look up exact TV airtimes' }));
    await user.click(screen.getByRole('button', { name: 'Recently released retention' }));
    await user.click(screen.getByRole('option', { name: '14 days' }));

    expect(useSettingsStore.getState()).toMatchObject({
      upcomingHomeEnabled: false,
      upcomingCountdownEnabled: false,
      upcomingCalendarEnabled: false,
      upcomingExactTimesEnabled: false,
      upcomingHistoryDays: 14,
    });
  });

  it('disables subordinate controls when Coming Up is turned off', async () => {
    const user = userEvent.setup();
    render(<ComingUpSettingsSection />);

    await user.click(screen.getByRole('checkbox', { name: 'Enable Coming Up' }));

    expect(useSettingsStore.getState().upcomingEnabled).toBe(false);
    expect(
      screen.getByRole('checkbox', { name: 'Show Coming Up on Home' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('checkbox', { name: 'Show live release countdowns' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('checkbox', { name: 'Show release calendar' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('checkbox', { name: 'Look up exact TV airtimes' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Recently released retention' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
