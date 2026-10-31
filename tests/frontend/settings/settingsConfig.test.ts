// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSettingsConfig,
  MAX_SETTINGS_CONFIG_BYTES,
  parseSettingsConfig,
  sanitizeSettingsConfig,
  serializeSettingsConfig,
  SETTINGS_CONFIG_FORMAT,
  SETTINGS_CONFIG_VERSION,
} from '@/modules/settings/services/settingsConfig';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('portable settings configuration', () => {
  it('exports only portable preferences in a versioned document', () => {
    useSettingsStore.getState().updateSetting('accentColor', '#af52de');
    useSettingsStore.getState().updateSetting('themePreference', 'light');
    useSettingsStore.getState().updateSetting('tmdbApiKey', 'local-secret');
    useSettingsStore.getState().updateSetting('tmdbLanguage', 'de-DE');
    useSettingsStore.getState().updateSetting('tmdbImageSize', 'w780');
    useSettingsStore
      .getState()
      .updateSetting('epgXmltvUrl', 'https://guide.test/private.xml?token=secret');
    useSettingsStore.getState().updateSetting('upcomingHomeEnabled', false);
    useSettingsStore.getState().updateSetting('upcomingCalendarEnabled', false);
    useSettingsStore.getState().updateSetting('upcomingHistoryDays', 14);
    useSettingsStore.getState().updateSetting('language', 'de');
    const document = createSettingsConfig(useSettingsStore.getState(), '2026-08-10T12:00:00.000Z');
    const serialized = serializeSettingsConfig(useSettingsStore.getState());

    expect(document).toMatchObject({
      format: SETTINGS_CONFIG_FORMAT,
      version: SETTINGS_CONFIG_VERSION,
      exportedAt: '2026-08-10T12:00:00.000Z',
      settings: {
        accentColor: '#af52de',
        themePreference: 'light',
        language: 'de',
        tmdbLanguage: 'de-DE',
        tmdbImageSize: 'w780',
        upcomingHomeEnabled: false,
        upcomingCalendarEnabled: false,
        upcomingHistoryDays: 14,
        skipIntroEnabled: true,
        skipRecapEnabled: true,
        autoSkipIntro: false,
        introDbEnabled: true,
      },
    });
    expect(document.settings).not.toHaveProperty('updateSetting');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('streamUrl');
    expect(serialized).not.toContain('local-secret');
    expect(serialized).not.toContain('guide.test');
    expect(document.settings).not.toHaveProperty('epgXmltvUrl');
  });

  it('migrates partial files, sanitizes malformed values, and reports unknown entries', () => {
    const parsed = parseSettingsConfig(
      JSON.stringify({
        format: SETTINGS_CONFIG_FORMAT,
        version: 1,
        exportedAt: '2025-04-05T10:30:00Z',
        settings: {
          cacheSecs: 999,
          seekJumpSecs: 30,
          accentColor: 'not-a-color',
          themePreference: 'system',
          enableNotifications: 'yes',
          hardwareAcceleration: 'yes',
          hwdecMode: 'turbo',
          categoryPrefs: { hidden: { vod: ['10', '10', 11] } },
          upcomingHistoryDays: 365,
          futurePreference: true,
          epgXmltvUrl: 'https://guide.test/legacy.xml',
        },
      }),
    );

    expect(parsed.document.settings).toMatchObject({
      cacheSecs: 30,
      seekJumpSecs: 30,
      accentColor: '#0672e5',
      themePreference: 'dark',
      enableNotifications: true,
      hardwareAcceleration: true,
      hwdecMode: 'auto-safe',
      upcomingHistoryDays: 7,
    });
    expect(parsed.document.settings).not.toHaveProperty('categoryPrefs');
    expect(parsed.ignoredKeys).toEqual(['categoryPrefs', 'futurePreference', 'epgXmltvUrl']);
  });

  it('rejects non-finite runtime values during sanitization', () => {
    const settings = sanitizeSettingsConfig({
      rememberedVolume: Number.NaN,
      rememberedPlaybackSpeed: Number.POSITIVE_INFINITY,
      sidebarWidth: Number.NEGATIVE_INFINITY,
    });

    expect(settings.rememberedVolume).toBe(100);
    expect(settings.rememberedPlaybackSpeed).toBe(1);
    expect(settings.sidebarWidth).toBe(260);
  });

  it('preserves every supported interface and metadata locale', () => {
    expect(sanitizeSettingsConfig({ language: 'pt-BR', tmdbLanguage: 'pl-PL' })).toMatchObject({
      language: 'pt-BR',
      tmdbLanguage: 'pl-PL',
    });
    expect(sanitizeSettingsConfig({ language: 'ar', tmdbLanguage: 'ja-JP' })).toMatchObject({
      language: 'en',
      tmdbLanguage: 'auto',
    });
  });

  it('rejects unrelated, future, malformed, and oversized documents', () => {
    expect(() => parseSettingsConfig('{')).toThrow('valid JSON');
    expect(() =>
      parseSettingsConfig(JSON.stringify({ format: 'other', version: 1, settings: {} })),
    ).toThrow('not a Movena');
    expect(() =>
      parseSettingsConfig(
        JSON.stringify({
          format: SETTINGS_CONFIG_FORMAT,
          version: SETTINGS_CONFIG_VERSION + 1,
          settings: {},
        }),
      ),
    ).toThrow('newer version');
    expect(() => parseSettingsConfig(' '.repeat(MAX_SETTINGS_CONFIG_BYTES + 1))).toThrow('larger');
  });
});
