// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureNotificationRuntime,
  useNotificationStore,
} from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useNotificationStore.setState({ notifications: [] });
  usePlayerStore.setState({ activeStream: null });
  configureNotificationRuntime({
    getPreferences: () => useSettingsStore.getState(),
    isPlaybackActive: () => Boolean(usePlayerStore.getState().activeStream),
  });
});

describe('notification store', () => {
  it('honors global and category-specific notification settings', () => {
    useSettingsStore.getState().updateSetting('notifyPlaybackEvents', false);
    expect(
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Playing',
        category: 'playback',
      }),
    ).toBe('');

    useSettingsStore.getState().updateSetting('enableNotifications', false);
    expect(
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Offline',
        category: 'connection',
      }),
    ).toBe('');
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it('uses the configured duration while preserving explicit durations', () => {
    useSettingsStore.getState().updateSetting('toastDurationSecs', 2.5);
    useNotificationStore.getState().addNotification({ type: 'info', title: 'Default' });
    useNotificationStore
      .getState()
      .addNotification({ type: 'error', title: 'Explicit', duration: 9000 });

    expect(useNotificationStore.getState().notifications.map((item) => item.duration)).toEqual([
      9000, 2500,
    ]);
  });

  it('keeps only the six newest notifications', () => {
    for (let index = 0; index < 8; index += 1) {
      useNotificationStore.getState().addNotification({ type: 'info', title: `Toast ${index}` });
    }

    expect(useNotificationStore.getState().notifications.map((item) => item.title)).toEqual([
      'Toast 7',
      'Toast 6',
      'Toast 5',
      'Toast 4',
      'Toast 3',
      'Toast 2',
    ]);
  });

  it('suppresses non-critical notifications before they can trigger a DND chime', () => {
    useSettingsStore.getState().updateSetting('dndDuringPlayback', true);
    usePlayerStore.setState({
      activeStream: {
        id: 'stream',
        title: 'Channel',
        type: 'live',
        streamUrl: 'https://stream.test/live',
      },
    });

    expect(
      useNotificationStore
        .getState()
        .addNotification({ type: 'success', title: 'Saved', category: 'library' }),
    ).toBe('');
    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(
      useNotificationStore
        .getState()
        .addNotification({ type: 'error', title: 'Failed', category: 'playback' }),
    ).not.toBe('');
  });
});
