// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationSettingsSection } from '@/modules/settings/components/NotificationSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('notification settings disabled-state propagation', () => {
  it('disables all child controls when notifications are turned off', async () => {
    const user = userEvent.setup();
    useSettingsStore.getState().updateSetting('enableNotifications', false);
    render(<NotificationSettingsSection />);

    // Position segmented control radios should be disabled
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveProperty('disabled', true);
    }

    // Event toggles should be disabled
    const checkboxes = screen.getAllByRole('checkbox');
    const eventCheckboxes = checkboxes.filter(
      (checkbox) => checkbox !== screen.getByRole('checkbox', { name: 'Enable notifications' }),
    );
    for (const checkbox of eventCheckboxes) {
      expect(checkbox).toHaveProperty('disabled', true);
    }

    // Enable notifications
    await user.click(screen.getByRole('checkbox', { name: 'Enable notifications' }));

    // All radios and event checkboxes should now be enabled
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveProperty('disabled', false);
    }
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toHaveProperty('disabled', false);
    }
  });

  it('toggles download notifications preference', async () => {
    const user = userEvent.setup();
    render(<NotificationSettingsSection />);

    const downloadToggle = screen.getByRole('checkbox', { name: 'Download Alerts' });
    expect(useSettingsStore.getState().notifyDownloadEvents).toBe(true);

    await user.click(downloadToggle);
    expect(useSettingsStore.getState().notifyDownloadEvents).toBe(false);
  });
});
