// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({
  getVersion: vi.fn().mockResolvedValue('0.1.9'),
  isDesktop: vi.fn().mockReturnValue(true),
  openUrl: vi.fn().mockResolvedValue(undefined),
  relaunch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/platform/desktop', () => ({ desktopApi: desktop }));

import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { useDebugStore } from '@/modules/diagnostics/store/useDebugStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

function BrokenView(): never {
  throw new Error('Failed at https://provider.test/live/private-user/private-password/42');
}

describe('top-level crash recovery', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
    useDebugStore.setState({ logs: [], networkLogs: [] });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('offers a real desktop restart instead of rerendering the broken tree', async () => {
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restart Movena' }));
    await waitFor(() => expect(desktop.relaunch).toHaveBeenCalledTimes(1));
  });

  it('copies a redacted report and opens the structured issue form', async () => {
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic report' }));
    await screen.findByText('Sanitized diagnostic report copied to the clipboard.');
    const report = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] ?? '';
    expect(report).toContain('"version": "0.1.9"');
    expect(report).toContain('[URL]');
    expect(report).not.toContain('private-password');

    fireEvent.click(screen.getByRole('button', { name: 'Report an Issue' }));
    await waitFor(() =>
      expect(desktop.openUrl).toHaveBeenCalledWith(
        'https://github.com/movena-app/movena/issues/new?template=bug-report.yml',
      ),
    );
  });

  it('shows sanitized technical details only when developer mode is enabled', () => {
    useSettingsStore.getState().updateSetting('debugMode', true);
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Technical details')).toBeTruthy();
    expect(screen.getByText(/\[URL\]/)).toBeTruthy();
    expect(screen.queryByText(/private-password/)).toBeNull();
  });
});
