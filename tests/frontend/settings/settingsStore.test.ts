// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateSettingsState, useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useCatalogCategorySelection } from '@/modules/catalog/hooks/useCatalogCategorySelection';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('settings store', () => {
  it('defaults and resets the interface theme to dark', () => {
    expect(useSettingsStore.getState().themePreference).toBe('dark');
    useSettingsStore.getState().updateSetting('themePreference', 'light');
    expect(useSettingsStore.getState().themePreference).toBe('light');
    useSettingsStore.getState().resetSettings();
    expect(useSettingsStore.getState().themePreference).toBe('dark');
  });

  it('never persists the TMDB API key in localStorage', () => {
    useSettingsStore.getState().updateSetting('tmdbApiKey', 'super-secret-tmdb-key');
    expect(localStorage.getItem('iptv-settings-storage')).not.toContain('super-secret-tmdb-key');
  });

  it('clamps finite native volume and keeps the last audible value through mute', () => {
    useSettingsStore.getState().rememberPlayerVolume(65);
    useSettingsStore.getState().rememberPlayerVolume(0);

    expect(useSettingsStore.getState()).toMatchObject({
      rememberedVolume: 0,
      lastAudibleVolume: 65,
    });
  });

  it('toggles one category preference without disturbing sibling catalogues', () => {
    const store = useSettingsStore.getState();
    store.toggleCategoryPref('hidden', 'vod', '10');
    store.toggleCategoryPref('hidden', 'live', '20');
    store.toggleCategoryPref('hidden', 'vod', '10');

    expect(useSettingsStore.getState().categoryPrefs.hidden).toEqual({
      live: ['20'],
      vod: [],
      series: [],
    });
  });

  it('deeply restores missing category preference branches during migration', () => {
    const migrated = migrateSettingsState({
      categoryPrefs: { hidden: { vod: ['10'] } },
    });

    expect(migrated.categoryPrefs.hidden).toEqual({ live: [], vod: ['10'], series: [] });
    expect(migrated.categoryPrefs.pinnedCountries).toEqual({ live: [], vod: [], series: [] });
  });

  it('rejects non-finite persisted player values', () => {
    const migrated = migrateSettingsState({
      rememberedVolume: Number.NaN,
      lastAudibleVolume: Number.POSITIVE_INFINITY,
      rememberedPlaybackSpeed: Number.NaN,
    });

    expect(migrated.rememberedVolume).toBe(100);
    expect(migrated.lastAudibleVolume).toBe(100);
    expect(migrated.rememberedPlaybackSpeed).toBe(1);
  });

  it('restores each catalogue category after its page hook remounts', () => {
    const firstMount = renderHook(() => useCatalogCategorySelection('vod'));

    act(() => firstMount.result.current[1]('source:category:42'));
    firstMount.unmount();

    const secondMount = renderHook(() => useCatalogCategorySelection('vod'));
    expect(secondMount.result.current[0]).toBe('source:category:42');
    expect(useSettingsStore.getState().selectedCategoryIds).toEqual({
      live: null,
      vod: 'source:category:42',
      series: null,
    });
  });

  it('sanitizes restored workspace context and TV guide zoom', () => {
    const migrated = migrateSettingsState({
      selectedCategoryIds: { live: 'country:DE', vod: 42, series: 'drama' },
      lastCollectionId: 'collection-7',
      epgZoomPercent: 999,
    });

    expect(migrated.selectedCategoryIds).toEqual({
      live: 'country:DE',
      vod: null,
      series: 'drama',
    });
    expect(migrated.lastCollectionId).toBe('collection-7');
    expect(migrated.epgZoomPercent).toBe(200);
  });

  it('sanitizes TMDB preferences and preserves safe defaults', () => {
    const migrated = migrateSettingsState({
      tmdbEnabled: 'yes',
      tmdbLanguage: 'invalid-lang',
      tmdbImageSize: 'original',
      tmdbIncludeAdult: true,
    });

    expect(migrated).toMatchObject({
      tmdbEnabled: false,
      tmdbLanguage: 'auto',
      tmdbImageSize: 'w500',
      tmdbIncludeAdult: true,
    });
  });

  it('resets metadata and release schedule preferences to false by default', () => {
    useSettingsStore.setState({
      tmdbEnabled: true,
      upcomingEnabled: true,
      upcomingHomeEnabled: true,
      upcomingCountdownEnabled: true,
      upcomingCalendarEnabled: true,
      upcomingExactTimesEnabled: true,
      upcomingHistoryDays: 30,
    });

    useSettingsStore.getState().resetSettings();

    expect(useSettingsStore.getState()).toMatchObject({
      tmdbEnabled: false,
      upcomingEnabled: false,
      upcomingHomeEnabled: false,
      upcomingCountdownEnabled: false,
      upcomingCalendarEnabled: false,
      upcomingExactTimesEnabled: false,
      upcomingHistoryDays: 7,
    });
  });

  it('sanitizes recently released retention to supported windows', () => {
    expect(migrateSettingsState({ upcomingHistoryDays: 14 }).upcomingHistoryDays).toBe(14);
    expect(migrateSettingsState({ upcomingHistoryDays: 365 }).upcomingHistoryDays).toBe(7);
    expect(migrateSettingsState({ upcomingHistoryDays: '7' }).upcomingHistoryDays).toBe(7);
  });

  it('sanitizes download queue preferences', () => {
    const migrated = migrateSettingsState({
      downloadDirectory: 42,
      maxConcurrentDownloads: 99.8,
      autoStartDownloads: false,
      notifyDownloadEvents: false,
    });

    expect(migrated).toMatchObject({
      downloadDirectory: '',
      maxConcurrentDownloads: 8,
      autoStartDownloads: false,
      notifyDownloadEvents: false,
    });
  });

  it('manages custom title rules and badge visibility', () => {
    const store = useSettingsStore.getState();
    expect(store.streamFoldingEnabled).toBe(true);
    expect(store.customTitleRules).toEqual([]);
    expect(store.badgeVisibility).toEqual({
      resolution: true,
      fps: true,
      audio: true,
      edition: true,
      verified: true,
    });

    store.addCustomTitleRule('TEST_PATTERN', true);
    const rules = useSettingsStore.getState().customTitleRules;
    expect(rules).toHaveLength(1);
    expect(rules[0]!.pattern).toBe('TEST_PATTERN');
    expect(rules[0]!.isRegex).toBe(true);
    expect(rules[0]!.enabled).toBe(true);

    store.toggleCustomTitleRule(rules[0]!.id);
    expect(useSettingsStore.getState().customTitleRules[0]!.enabled).toBe(false);

    store.removeCustomTitleRule(rules[0]!.id);
    expect(useSettingsStore.getState().customTitleRules).toHaveLength(0);

    store.setBadgeVisibility('edition', false);
    expect(useSettingsStore.getState().badgeVisibility.edition).toBe(false);
  });

  it('sanitizes title normalization rules during migration', () => {
    const migrated = migrateSettingsState({
      streamFoldingEnabled: false,
      customTitleRules: [{ id: 'r1', pattern: 'SERVER', isRegex: 'yes', enabled: 'no' }, 'invalid'],
      badgeVisibility: { edition: false },
    });

    expect(migrated.streamFoldingEnabled).toBe(false);
    expect(migrated.customTitleRules).toEqual([
      { id: 'r1', pattern: 'SERVER', isRegex: true, enabled: true },
    ]);
    expect(migrated.badgeVisibility).toEqual({
      resolution: true,
      fps: true,
      audio: true,
      edition: false,
      verified: true,
    });
  });

  it('imports a complete validated snapshot without losing store actions', () => {
    const current = useSettingsStore.getState();
    const snapshot = {
      ...Object.fromEntries(
        Object.entries(current).filter(([, value]) => typeof value !== 'function'),
      ),
      accentColor: '#af52de',
      themePreference: 'light',
      cacheSecs: 15,
    } as Parameters<typeof current.importSettings>[0];

    current.importSettings(snapshot);

    expect(useSettingsStore.getState()).toMatchObject({
      accentColor: '#af52de',
      themePreference: 'light',
      cacheSecs: 15,
    });
    expect(useSettingsStore.getState().resetSettings).toBeTypeOf('function');
  });

  it('manages channel logo aspect overrides and migration', () => {
    const store = useSettingsStore.getState();
    store.setSmartLogoAspectMode('force-16:9');
    store.setChannelLogoAspectOverride('ch-1', '16:9');
    store.setChannelLogoAspectOverride('ch-2', '4:3');

    expect(useSettingsStore.getState().smartLogoAspectMode).toBe('force-16:9');
    expect(useSettingsStore.getState().channelLogoAspectOverrides).toEqual({
      'ch-1': '16:9',
      'ch-2': '4:3',
    });

    store.setChannelLogoAspectOverride('ch-1', 'auto');
    expect(useSettingsStore.getState().channelLogoAspectOverrides).toEqual({
      'ch-2': '4:3',
    });

    const migrated = migrateSettingsState({
      smartLogoAspectMode: 'invalid',
      channelLogoAspectOverrides: { 'ch-3': 'original', 'ch-4': 'bad' },
    });
    expect(migrated.smartLogoAspectMode).toBe('auto');
    expect(migrated.channelLogoAspectOverrides).toEqual({ 'ch-3': 'original' });
  });

  it('excludes ephemeral window and onboarding state from portable snapshot keys', async () => {
    const { SETTINGS_SNAPSHOT_KEYS } = await import('@/modules/settings/store/useSettingsStore');
    expect(SETTINGS_SNAPSHOT_KEYS).not.toContain('onboardingDismissed');
    expect(SETTINGS_SNAPSHOT_KEYS).not.toContain('sidebarCollapsed');
    expect(SETTINGS_SNAPSHOT_KEYS).not.toContain('epgXmltvUrl');
    expect(SETTINGS_SNAPSHOT_KEYS).toContain('themePreference');
  });
});
