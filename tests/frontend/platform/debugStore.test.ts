// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { useDebugStore } from '@/modules/diagnostics/store/useDebugStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useDebugStore.setState({ logs: [], networkLogs: [] });
});

describe('debug store', () => {
  it('honors the configured log floor', () => {
    useSettingsStore.getState().updateSetting('debugLogLevel', 'warn');
    useDebugStore.getState().addLog('info', 'system', 'ignored');
    useDebugStore.getState().addLog('error', 'system', 'kept');

    expect(useDebugStore.getState().logs.map((entry) => entry.message)).toEqual(['kept']);
  });

  it('redacts credentials in log messages, details, and network entries', () => {
    useDebugStore
      .getState()
      .addLog('error', 'api', 'https://provider.test/live/alice/secret/1', { password: 'secret' });
    useDebugStore.getState().addNetworkLog({
      url: 'https://provider.test/player_api.php?username=alice&password=secret',
      method: 'GET',
      error: 'https://provider.test/movie/alice/secret/2',
      responsePreview: '{"username":"alice","password":"secret"}',
    });

    const serialized = JSON.stringify(useDebugStore.getState());
    expect(serialized).not.toContain('alice');
    expect(serialized).not.toContain('secret');
  });

  it('exports a redacted, count-bearing report', () => {
    useDebugStore.getState().addLog('error', 'system', 'Failure');
    const report = JSON.parse(
      useDebugStore.getState().exportDebugReport({
        player: { phase: 'Idle' },
        password: 'must-not-leak',
      }),
    );

    expect(report.logsCount).toBe(1);
    expect(report.networkLogsCount).toBe(0);
    expect(report.environment.userAgent).toBeTypeOf('string');
    expect(report.summary.levels.error).toBe(1);
    expect(report.context.player.phase).toBe('Idle');
    expect(report.context.password).toBe('[REDACTED]');
    expect(JSON.stringify(report)).not.toContain('must-not-leak');
  });

  it('summarizes request failures and average latency', () => {
    useDebugStore.getState().addNetworkLog({
      url: 'https://provider.test/player_api.php',
      method: 'GET',
      status: 500,
      durationMs: 1200,
    });
    useDebugStore.getState().addNetworkLog({
      url: 'https://provider.test/player_api.php',
      method: 'GET',
      status: 200,
      durationMs: 200,
    });

    const report = JSON.parse(useDebugStore.getState().exportDebugReport());
    expect(report.summary.failedRequests).toBe(1);
    expect(report.summary.averageRequestMs).toBe(700);
  });
});
