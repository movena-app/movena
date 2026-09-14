// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/modules/settings/services/settingsConfig', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/modules/settings/services/settingsConfig')>();
  return {
    ...actual,
    saveSettingsConfig: vi.fn(),
    selectSettingsConfig: vi.fn(),
    countChangedSettings: vi.fn(),
  };
});

import { PortableSettingsSection } from '@/modules/settings/components/PortableSettingsSection';
import {
  countChangedSettings,
  saveSettingsConfig,
  selectSettingsConfig,
} from '@/modules/settings/services/settingsConfig';
import { getSettingsSnapshot, useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const saveMock = vi.mocked(saveSettingsConfig);
const selectMock = vi.mocked(selectSettingsConfig);
const countMock = vi.mocked(countChangedSettings);

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  vi.clearAllMocks();
});

describe('import and export settings page', () => {
  it('previews a valid file and applies it only after confirmation', async () => {
    const imported = {
      ...getSettingsSnapshot(useSettingsStore.getState()),
      accentColor: '#af52de',
      seekJumpSecs: 30,
    };
    selectMock.mockResolvedValue({
      fileName: 'living-room.json',
      ignoredKeys: [],
      document: {
        format: 'movena.settings',
        version: 1,
        exportedAt: '2026-08-10T12:00:00.000Z',
        settings: imported,
      },
    });
    countMock.mockReturnValue(2);
    const user = userEvent.setup();
    render(<PortableSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Choose File' }));

    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/will replace 2 current preferences/i)).toBeTruthy();
    expect(useSettingsStore.getState().accentColor).not.toBe('#af52de');

    await user.click(screen.getByRole('button', { name: 'Import Settings' }));

    expect(useSettingsStore.getState()).toMatchObject({ accentColor: '#af52de', seekJumpSecs: 30 });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Imported 2 changed preferences');
  });

  it('exports the current settings and reports the saved file', async () => {
    saveMock.mockResolvedValue('movena-settings-2026-08-10.json');
    const user = userEvent.setup();
    render(<PortableSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Export File' }));

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ accentColor: '#0672e5' }));
    expect(screen.getByRole('status').textContent).toContain('movena-settings-2026-08-10.json');
  });

  it('copies configuration JSON to the clipboard', async () => {
    const user = userEvent.setup();
    const localWriteMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: localWriteMock,
      },
      configurable: true,
      writable: true,
    });

    render(<PortableSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));

    expect(localWriteMock).toHaveBeenCalled();
    const clipboardContent = JSON.parse(localWriteMock.mock.calls[0]![0]);
    expect(clipboardContent.format).toBe('movena.settings');
    expect(clipboardContent.version).toBe(1);
    expect(clipboardContent.settings).toBeDefined();
  });

  it('pastes settings JSON, validates it, and imports it', async () => {
    countMock.mockImplementation((_, settings) => {
      return settings.accentColor === '#af52de' ? 1 : 0;
    });

    const user = userEvent.setup();
    render(<PortableSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Paste JSON' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    const textarea = screen.getByPlaceholderText(/paste your settings JSON/i);
    const validJson = JSON.stringify({
      format: 'movena.settings',
      version: 1,
      exportedAt: '2026-08-11T20:12:00.000Z',
      settings: {
        accentColor: '#af52de',
      },
    });

    fireEvent.change(textarea, { target: { value: validJson } });

    expect(screen.getByText(/Valid configuration: will update 1 preference/i)).toBeTruthy();

    const importButton = screen.getByRole('button', {
      name: 'Import Settings',
    }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(false);

    await user.click(importButton);

    expect(useSettingsStore.getState().accentColor).toBe('#af52de');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      'Imported 1 changed preference from pasted JSON',
    );
  });

  it('shows validation error when pasting invalid settings JSON', async () => {
    const user = userEvent.setup();
    render(<PortableSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Paste JSON' }));

    const textarea = screen.getByPlaceholderText(/paste your settings JSON/i);
    fireEvent.change(textarea, { target: { value: 'invalid JSON data' } });

    expect(screen.getByText(/is not a valid JSON settings file/i)).toBeTruthy();

    const importButton = screen.getByRole('button', {
      name: 'Import Settings',
    }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
