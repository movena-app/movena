// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGlobalDebugCapture } from '@/modules/diagnostics/hooks/useGlobalDebugCapture';
import { useDebugStore } from '@/modules/diagnostics/store/useDebugStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

function CaptureHarness({ enabled }: { enabled: boolean }) {
  useGlobalDebugCapture(enabled);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useDebugStore.setState({ logs: [], networkLogs: [] });
});

describe('global debug capture', () => {
  it('records browser errors and unhandled promise rejections', () => {
    render(<CaptureHarness enabled />);

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Render exploded',
        filename: 'https://app.test/main.js',
        lineno: 42,
        error: new Error('Render exploded'),
      }),
    );
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: new Error('Async exploded') });
    window.dispatchEvent(rejection);

    expect(useDebugStore.getState().logs.map((entry) => entry.message)).toEqual([
      'Unhandled promise rejection: Async exploded',
      'Unhandled error: Render exploded',
    ]);
  });

  it('removes listeners when capture is disabled', () => {
    const { rerender } = render(<CaptureHarness enabled />);
    rerender(<CaptureHarness enabled={false} />);
    window.dispatchEvent(new ErrorEvent('error', { message: 'Ignored' }));

    expect(useDebugStore.getState().logs).toHaveLength(0);
  });
});
