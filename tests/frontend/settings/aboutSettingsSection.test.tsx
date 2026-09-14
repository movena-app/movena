// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const clearAllAppDataMock = vi.hoisted(() => vi.fn());
const deleteTmdbApiKeyMock = vi.hoisted(() => vi.fn());
const appUpdater = vi.hoisted(() => ({
  checkForAppUpdates: vi.fn(),
  installAppUpdate: vi.fn(),
}));

vi.mock('@/modules/settings/services/appDataReset', () => ({
  clearAllAppData: clearAllAppDataMock,
}));
vi.mock('@/modules/updates/services/appUpdater', () => appUpdater);
vi.mock('@/modules/metadata/services/tmdbCredentialVault', () => ({
  deleteTmdbApiKey: deleteTmdbApiKeyMock,
}));

import { AboutSettingsSection } from '@/modules/settings/components/AboutSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useNotificationStore } from '@/shared/notifications/useNotificationStore';
import { useUpdateStore } from '@/modules/updates/store/useUpdateStore';

const updateHandle = { close: vi.fn().mockResolvedValue(undefined) } as unknown as never;
const updateInfo = { version: '2.0.0', currentVersion: '1.0.0', body: 'Fixes things.' };

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useNotificationStore.getState().clearAll();
  useUpdateStore.setState({ phase: 'idle', info: null, progress: null, error: null, handle: null });
  clearAllAppDataMock.mockReset().mockResolvedValue(undefined);
  deleteTmdbApiKeyMock.mockReset().mockResolvedValue(undefined);
  appUpdater.checkForAppUpdates.mockReset();
  appUpdater.installAppUpdate.mockReset();
});

describe('all-data deletion settings control', () => {
  it('keeps the settings-only reset separate from deleting all app data', async () => {
    const user = userEvent.setup();
    useSettingsStore.getState().updateSetting('accentColor', '#af52de');
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Reset Settings' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset all settings?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset Settings' }));

    expect(useSettingsStore.getState().accentColor).toBe('#0672e5');
    expect(clearAllAppDataMock).not.toHaveBeenCalled();
  });

  it('requires confirmation before deleting all managed app data', async () => {
    const user = userEvent.setup();
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Delete All Data' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete all Movena data?' });
    expect(dialog).toBeTruthy();
    expect(clearAllAppDataMock).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/sources and credentials/i)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Delete All Data' }));

    expect(clearAllAppDataMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('presents metadata sources as equal attribution links without privileging one logo', () => {
    render(<AboutSettingsSection />);
    const tmdbButton = screen.getByRole('button', { name: 'TMDB' });

    expect(tmdbButton.closest('[class*="aboutBody"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'TVmaze' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'IntroDB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CC BY-SA 4.0' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'TMDB' })).toBeNull();
  });

  it('groups destructive actions under a single unified Danger Zone section', () => {
    render(<AboutSettingsSection />);
    const dangerZoneHeading = screen.getByRole('heading', { name: 'Danger Zone', level: 2 });
    const dangerSection = dangerZoneHeading.closest('section');

    expect(dangerSection).not.toBeNull();
    expect(within(dangerSection!).getByRole('button', { name: 'Reset Settings' })).toBeTruthy();
    expect(within(dangerSection!).getByRole('button', { name: 'Delete All Data' })).toBeTruthy();
  });

  it('renders a Check for Updates button', () => {
    render(<AboutSettingsSection />);
    expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeTruthy();
  });

  it('renders about links including Discord, GitHub, and issues', () => {
    render(<AboutSettingsSection />);
    expect(screen.getByRole('button', { name: 'Discord' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View on GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report an Issue' })).toBeTruthy();
  });
});

describe('update download and install flow', () => {
  it('never installs on its own — checking only reveals a Download & Install button', async () => {
    const user = userEvent.setup();
    appUpdater.checkForAppUpdates.mockResolvedValue({
      available: true,
      updateInfo,
      update: updateHandle,
    });
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: /Check for Updates/ }));

    expect(await screen.findByRole('button', { name: /Download & Install/ })).toBeTruthy();
    expect(appUpdater.installAppUpdate).not.toHaveBeenCalled();
  });

  it('reports up to date without touching the installer when nothing is available', async () => {
    const user = userEvent.setup();
    appUpdater.checkForAppUpdates.mockResolvedValue({ available: false });
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: /Check for Updates/ }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications[0]).toMatchObject({
        type: 'info',
        title: 'Up to Date',
      }),
    );
    expect(screen.queryByRole('button', { name: /Download & Install/ })).toBeNull();
  });

  it('shows download progress and never leaves the button silently finishing', async () => {
    const user = userEvent.setup();
    let releaseInstall!: () => void;
    appUpdater.installAppUpdate.mockImplementation(
      (
        _handle: unknown,
        options: {
          onProgress?: (p: { downloaded: number; total: number | null }) => void;
        },
      ) =>
        new Promise<void>((resolve) => {
          options.onProgress?.({ downloaded: 0, total: 200 });
          options.onProgress?.({ downloaded: 100, total: 200 });
          releaseInstall = resolve;
        }),
    );
    useUpdateStore.setState({
      phase: 'available',
      info: updateInfo,
      handle: updateHandle,
      progress: null,
      error: null,
    });
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: /Download & Install/ }));

    expect(await screen.findByText('50%', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download & Install/ })).toBeNull();
    releaseInstall();
  });

  it('surfaces an install failure instead of leaving the UI stuck mid-download', async () => {
    const user = userEvent.setup();
    appUpdater.installAppUpdate.mockRejectedValue(new Error('disk full'));
    useUpdateStore.setState({
      phase: 'available',
      info: updateInfo,
      handle: updateHandle,
      progress: null,
      error: null,
    });
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: /Download & Install/ }));

    expect(await screen.findByRole('button', { name: /Check for Updates/ })).toBeTruthy();
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'error',
      title: 'Update Failed',
      message: 'disk full',
    });
  });

  it('lets the user dismiss an available update instead of forcing the install', async () => {
    const user = userEvent.setup();
    useUpdateStore.setState({
      phase: 'available',
      info: updateInfo,
      handle: updateHandle,
      progress: null,
      error: null,
    });
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Later' }));

    expect(screen.queryByRole('button', { name: /Download & Install/ })).toBeNull();
    expect(useSettingsStore.getState().dismissedUpdateVersion).toBe('2.0.0');
  });
});
