import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AspectMode } from '@/modules/catalog/public/lib/aspect';
import { DEFAULT_ACCENT_COLOR, isValidHex } from '@/shared/design/color';
import { DEFAULT_RECORDING_DIRECTORY } from '@/modules/playback/public/lib/recording';
import { isUiLanguage, isUiLocale } from '@/shared/i18n/config';
import type { CustomTitleRule } from '@/modules/catalog/public/lib/titleParser';
import { sanitizeHomeSections } from '@/modules/catalog/public/lib/homeSections';
import {
  SETTINGS_SNAPSHOT_KEYS,
  type BadgeVisibilitySettings,
  type CatalogSortMode,
  type CatalogSortModes,
  type CatalogType,
  type CategoryPrefs,
  type ChannelLogoAspect,
  type HdrMode,
  type SelectedCategoryIds,
  type SettingsSnapshot,
  type SettingsState,
  type SmartLogoAspectMode,
  type ThemePreference,
  type UpcomingHistoryDays,
} from './settingsTypes';

export { SETTINGS_SNAPSHOT_KEYS } from './settingsTypes';
export type {
  BadgeVisibilitySettings,
  CatalogSortMode,
  CatalogSortModes,
  CatalogType,
  CategoryPrefs,
  ChannelLogoAspect,
  HdrMode,
  HwdecMode,
  MotionPreference,
  ThemePreference,
  SelectedCategoryIds,
  SettingsSnapshot,
  SettingsState,
  SmartLogoAspectMode,
  ToneMappingMode,
  UpcomingHistoryDays,
} from './settingsTypes';
export {
  HOME_SECTION_IDS,
  HOME_SECTION_LABELS,
  type HomeSectionId,
} from '@/modules/catalog/public/lib/homeSections';

const emptySelectedCategoryIds = (): SelectedCategoryIds => ({
  live: null,
  vod: null,
  series: null,
});

const emptyCatalogSortModes = (): CatalogSortModes => ({
  live: 'default',
  vod: 'default',
  series: 'default',
});

const normalizeSelectedCategoryIds = (value: unknown): SelectedCategoryIds => {
  const record =
    value && typeof value === 'object' ? (value as Partial<Record<CatalogType, unknown>>) : {};
  const normalizeId = (id: unknown): string | null =>
    typeof id === 'string' && id.length <= 512 ? id : null;
  return {
    live: normalizeId(record.live),
    vod: normalizeId(record.vod),
    series: normalizeId(record.series),
  };
};

const normalizeCatalogSortModes = (value: unknown): CatalogSortModes => {
  const record =
    value && typeof value === 'object' ? (value as Partial<Record<CatalogType, unknown>>) : {};
  const validModes = new Set<CatalogSortMode>([
    'default',
    'recently-added',
    'year-desc',
    'year-asc',
    'rating',
    'name-asc',
    'name-desc',
  ]);
  const normalize = (mode: unknown): CatalogSortMode =>
    typeof mode === 'string' && validModes.has(mode as CatalogSortMode)
      ? (mode as CatalogSortMode)
      : 'default';
  return {
    live: normalize(record.live),
    vod: normalize(record.vod),
    series: normalize(record.series),
  };
};

const emptyCategoryPrefs = (): CategoryPrefs => ({
  pinned: { live: [], vod: [], series: [] },
  hidden: { live: [], vod: [], series: [] },
  collapsed: { live: [], vod: [], series: [] },
  pinnedCountries: { live: [], vod: [], series: [] },
  hiddenCountries: { live: [], vod: [], series: [] },
});

const normalizeCategoryPrefs = (value: unknown): CategoryPrefs => {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<Record<keyof CategoryPrefs, unknown>>)
      : {};
  const normalizeBranch = (branch: unknown): Record<CatalogType, string[]> => {
    const record =
      branch && typeof branch === 'object' ? (branch as Partial<Record<CatalogType, unknown>>) : {};
    const normalizeIds = (ids: unknown): string[] =>
      Array.isArray(ids)
        ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
        : [];
    return {
      live: normalizeIds(record.live),
      vod: normalizeIds(record.vod),
      series: normalizeIds(record.series),
    };
  };

  return {
    pinned: normalizeBranch(source.pinned),
    hidden: normalizeBranch(source.hidden),
    collapsed: normalizeBranch(source.collapsed),
    pinnedCountries: normalizeBranch(source.pinnedCountries),
    hiddenCountries: normalizeBranch(source.hiddenCountries),
  };
};

const normalizeCustomTitleRules = (value: unknown): CustomTitleRule[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is CustomTitleRule =>
        !!r && typeof r === 'object' && typeof (r as CustomTitleRule).pattern === 'string',
    )
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : `rule-${Math.random().toString(36).slice(2, 9)}`,
      pattern: String(r.pattern).slice(0, 200),
      isRegex: Boolean(r.isRegex),
      enabled: r.enabled !== false,
    }));
};

const defaultBadgeVisibility = (): BadgeVisibilitySettings => ({
  resolution: true,
  fps: true,
  audio: true,
  edition: true,
  verified: true,
});

const DEFAULT_SETTINGS = {
  smartLogoAspectMode: 'auto' as SmartLogoAspectMode,
  channelLogoAspectOverrides: {} as Record<string, ChannelLogoAspect>,
  hardwareAcceleration: true,
  hwdecMode: 'auto-safe' as const,
  demuxerMaxBytes: '150MiB',
  cacheSecs: 30,
  seekJumpSecs: 10,
  aspectRatio: 'auto' as AspectMode,
  rememberedVolume: 100,
  lastAudibleVolume: 100,
  rememberedPlaybackSpeed: 1,
  subtitlesEnabled: true,
  autoPlayNextEpisode: true,
  skipIntroEnabled: true,
  skipRecapEnabled: true,
  autoSkipIntro: false,
  introDbEnabled: true,
  audioDelayMs: 0,
  subtitleFontSize: 38,
  subtitleFontFamily: 'sans-serif',
  subtitleOpacity: 100,
  subtitleBorderSize: 3,
  subtitleShadowOffset: 1,
  startupTimeoutMs: 20_000,
  streamFailoverEnabled: true,
  maxStreamFailovers: 2,
  language: 'en' as const,
  tmdbApiKey: '',
  tmdbEnabled: false,
  tmdbLanguage: 'auto' as const,
  tmdbImageSize: 'w500' as const,
  tmdbIncludeAdult: false,
  upcomingEnabled: false,
  upcomingHomeEnabled: false,
  upcomingCountdownEnabled: false,
  upcomingCalendarEnabled: false,
  upcomingExactTimesEnabled: false,
  homeSections: sanitizeHomeSections(undefined),
  upcomingHistoryDays: 7 as UpcomingHistoryDays,

  streamFoldingEnabled: true,
  customTitleRules: [] as CustomTitleRule[],
  badgeVisibility: defaultBadgeVisibility(),

  // HDR & Color defaults
  hdrMode: 'auto' as const,
  toneMappingMode: 'auto' as const,

  // Picture adjustment defaults
  imageSharpness: 0,
  imageBrightness: 100,
  imageContrast: 0,
  imageSaturation: 0,
  imageHue: 0,
  imageGamma: 0,

  epgSource: 'provider' as const,
  epgXmltvUrl: '',

  m3uEditorDensity: 'comfortable' as const,
  m3uEditorAutosaveDrafts: true,
  m3uEditorConfirmDestructive: true,
  m3uEditorRememberFilters: true,
  m3uEditorSidebarWidth: 240,
  m3uEditorInspectorWidth: 420,
  m3uHealthTimeoutMs: 6_000,
  m3uHealthConcurrency: 5,
  m3uPreserveUnknownTags: true,

  categoryPrefs: emptyCategoryPrefs(),
  selectedCategoryIds: emptySelectedCategoryIds(),
  catalogSortModes: emptyCatalogSortModes(),
  sidebarWidth: 260,
  viewMode: 'grid' as const,
  alwaysOnTop: false,
  accentColor: DEFAULT_ACCENT_COLOR,
  themePreference: 'dark' as ThemePreference,
  motionPreference: 'system' as const,
  onboardingDismissed: false,
  fourKDisclaimerDismissed: false,
  sidebarCollapsed: false,
  showCollapsedSidebarBadges: true,
  lastCollectionId: null,
  epgZoomPercent: 100,

  recordingPath: DEFAULT_RECORDING_DIRECTORY,
  instantRecord: false,

  downloadDirectory: '',
  maxConcurrentDownloads: 2,
  autoStartDownloads: true,

  // Notification Defaults
  enableNotifications: true,
  toastPosition: 'top-right' as const,
  toastDurationSecs: 4.5,
  dndDuringPlayback: true,
  notifyPlaybackEvents: true,
  notifyConnectionStatus: true,
  notifyLibraryUpdates: true,
  notifyDownloadEvents: true,
  notifySound: false,

  // Updates Defaults
  autoCheckUpdates: true,
  lastUpdateCheckTime: null,
  dismissedUpdateVersion: null,

  // Dev Defaults
  debugMode: false,
  showDebugOverlay: true,
  debugLogLevel: 'info' as const,
  logApiRequests: true,
};

export function getSettingsSnapshot(state: SettingsState): SettingsSnapshot {
  return Object.fromEntries(
    SETTINGS_SNAPSHOT_KEYS.map((key) => [key, state[key]]),
  ) as SettingsSnapshot;
}

const normalizeChannelLogoAspectOverrides = (value: unknown): Record<string, ChannelLogoAspect> => {
  if (!value || typeof value !== 'object') return {};
  const validAspects = new Set<ChannelLogoAspect>(['auto', '16:9', '4:3', 'original']);
  const result: Record<string, ChannelLogoAspect> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof k === 'string' &&
      typeof v === 'string' &&
      validAspects.has(v as ChannelLogoAspect)
    ) {
      result[k] = v as ChannelLogoAspect;
    }
  }
  return result;
};

export function migrateSettingsState(persistedState: unknown): SettingsState {
  const state = (
    persistedState && typeof persistedState === 'object' ? persistedState : {}
  ) as Partial<SettingsState> & {
    doviSupport?: unknown | undefined;
    playlistInput?: unknown | undefined;
    hdrMode?: HdrMode | 'always' | undefined;
    simulateNetworkDelay?: unknown | undefined;
    simulateNetworkDelayMs?: unknown | undefined;
    simulateNetworkErrorRate?: unknown | undefined;
  };
  const nextState = { ...state };
  delete nextState.doviSupport;
  delete nextState.playlistInput;
  delete nextState.simulateNetworkDelay;
  delete nextState.simulateNetworkDelayMs;
  delete nextState.simulateNetworkErrorRate;

  const legacyRecordingPaths = new Set([
    'Downloads/IPTV_Recordings',
    '~/Downloads/IPTV_Recordings',
    '~\\Downloads\\IPTV_Recordings',
  ]);
  const recordingPath =
    typeof state.recordingPath === 'string' && !legacyRecordingPaths.has(state.recordingPath)
      ? state.recordingPath
      : DEFAULT_RECORDING_DIRECTORY;
  const accentColor =
    typeof state.accentColor === 'string' &&
    isValidHex(state.accentColor) &&
    state.accentColor.toLowerCase() !== '#007aff'
      ? state.accentColor
      : DEFAULT_ACCENT_COLOR;

  const clampImageValue = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;

  const rawBadgeVis =
    state.badgeVisibility && typeof state.badgeVisibility === 'object'
      ? (state.badgeVisibility as Partial<BadgeVisibilitySettings>)
      : {};
  const badgeVisibility: BadgeVisibilitySettings = {
    resolution: rawBadgeVis.resolution !== false,
    fps: rawBadgeVis.fps !== false,
    audio: rawBadgeVis.audio !== false,
    edition: rawBadgeVis.edition !== false,
    verified: rawBadgeVis.verified !== false,
  };

  return {
    ...DEFAULT_SETTINGS,
    ...nextState,
    hdrMode: state.hdrMode === 'off' ? 'off' : 'auto',
    motionPreference:
      state.motionPreference === 'reduced' || state.motionPreference === 'full'
        ? state.motionPreference
        : 'system',
    themePreference: state.themePreference === 'light' ? 'light' : 'dark',
    rememberedVolume:
      typeof state.rememberedVolume === 'number' && Number.isFinite(state.rememberedVolume)
        ? Math.max(0, Math.min(100, state.rememberedVolume))
        : 100,
    lastAudibleVolume:
      typeof state.lastAudibleVolume === 'number' &&
      Number.isFinite(state.lastAudibleVolume) &&
      state.lastAudibleVolume > 0
        ? Math.max(1, Math.min(100, state.lastAudibleVolume))
        : 100,
    rememberedPlaybackSpeed:
      typeof state.rememberedPlaybackSpeed === 'number' &&
      Number.isFinite(state.rememberedPlaybackSpeed) &&
      state.rememberedPlaybackSpeed >= 0.5 &&
      state.rememberedPlaybackSpeed <= 2
        ? state.rememberedPlaybackSpeed
        : 1,
    subtitlesEnabled: typeof state.subtitlesEnabled === 'boolean' ? state.subtitlesEnabled : true,
    audioDelayMs: clampImageValue(state.audioDelayMs, -5000, 5000, 0),
    subtitleFontSize: clampImageValue(state.subtitleFontSize, 12, 96, 38),
    subtitleOpacity: clampImageValue(state.subtitleOpacity, 0, 100, 100),
    subtitleBorderSize: clampImageValue(state.subtitleBorderSize, 0, 12, 3),
    subtitleShadowOffset: clampImageValue(state.subtitleShadowOffset, 0, 12, 1),
    subtitleFontFamily:
      typeof state.subtitleFontFamily === 'string' && state.subtitleFontFamily.trim()
        ? state.subtitleFontFamily.slice(0, 80)
        : 'sans-serif',
    startupTimeoutMs: clampImageValue(state.startupTimeoutMs, 5_000, 120_000, 20_000),
    streamFailoverEnabled:
      typeof state.streamFailoverEnabled === 'boolean' ? state.streamFailoverEnabled : true,
    maxStreamFailovers: clampImageValue(state.maxStreamFailovers, 0, 5, 2),
    language: isUiLanguage(state.language) ? state.language : 'en',
    tmdbApiKey: typeof state.tmdbApiKey === 'string' ? state.tmdbApiKey.slice(0, 256) : '',
    tmdbEnabled: typeof state.tmdbEnabled === 'boolean' ? state.tmdbEnabled : false,
    tmdbLanguage:
      state.tmdbLanguage === 'auto' || isUiLocale(state.tmdbLanguage) ? state.tmdbLanguage : 'auto',
    tmdbImageSize:
      state.tmdbImageSize === 'w342' || state.tmdbImageSize === 'w780'
        ? state.tmdbImageSize
        : 'w500',
    tmdbIncludeAdult: typeof state.tmdbIncludeAdult === 'boolean' ? state.tmdbIncludeAdult : false,
    upcomingEnabled: typeof state.upcomingEnabled === 'boolean' ? state.upcomingEnabled : false,
    upcomingHomeEnabled:
      typeof state.upcomingHomeEnabled === 'boolean' ? state.upcomingHomeEnabled : false,
    upcomingCountdownEnabled:
      typeof state.upcomingCountdownEnabled === 'boolean' ? state.upcomingCountdownEnabled : false,
    upcomingCalendarEnabled:
      typeof state.upcomingCalendarEnabled === 'boolean' ? state.upcomingCalendarEnabled : false,
    upcomingExactTimesEnabled:
      typeof state.upcomingExactTimesEnabled === 'boolean'
        ? state.upcomingExactTimesEnabled
        : false,
    upcomingHistoryDays:
      state.upcomingHistoryDays === 3 ||
      state.upcomingHistoryDays === 14 ||
      state.upcomingHistoryDays === 30
        ? state.upcomingHistoryDays
        : 7,
    homeSections: sanitizeHomeSections(state.homeSections),
    streamFoldingEnabled:
      typeof state.streamFoldingEnabled === 'boolean' ? state.streamFoldingEnabled : true,
    customTitleRules: normalizeCustomTitleRules(state.customTitleRules),
    badgeVisibility,
    smartLogoAspectMode:
      state.smartLogoAspectMode === 'force-16:9' || state.smartLogoAspectMode === 'off'
        ? state.smartLogoAspectMode
        : 'auto',
    channelLogoAspectOverrides: normalizeChannelLogoAspectOverrides(
      state.channelLogoAspectOverrides,
    ),
    accentColor,
    showCollapsedSidebarBadges:
      typeof state.showCollapsedSidebarBadges === 'boolean'
        ? state.showCollapsedSidebarBadges
        : true,
    recordingPath,
    downloadDirectory:
      typeof state.downloadDirectory === 'string' ? state.downloadDirectory.slice(0, 4096) : '',
    maxConcurrentDownloads:
      typeof state.maxConcurrentDownloads === 'number' &&
      Number.isFinite(state.maxConcurrentDownloads)
        ? Math.max(1, Math.min(8, Math.floor(state.maxConcurrentDownloads)))
        : 2,
    autoStartDownloads:
      typeof state.autoStartDownloads === 'boolean' ? state.autoStartDownloads : true,
    notifyDownloadEvents:
      typeof state.notifyDownloadEvents === 'boolean' ? state.notifyDownloadEvents : true,
    categoryPrefs: normalizeCategoryPrefs(state.categoryPrefs),
    selectedCategoryIds: normalizeSelectedCategoryIds(state.selectedCategoryIds),
    catalogSortModes: normalizeCatalogSortModes(state.catalogSortModes),
    lastCollectionId:
      typeof state.lastCollectionId === 'string' && state.lastCollectionId.length <= 512
        ? state.lastCollectionId
        : null,
    epgZoomPercent: clampImageValue(state.epgZoomPercent, 50, 200, 100),
    m3uEditorDensity: state.m3uEditorDensity === 'compact' ? 'compact' : 'comfortable',
    m3uEditorAutosaveDrafts:
      typeof state.m3uEditorAutosaveDrafts === 'boolean' ? state.m3uEditorAutosaveDrafts : true,
    m3uEditorConfirmDestructive:
      typeof state.m3uEditorConfirmDestructive === 'boolean'
        ? state.m3uEditorConfirmDestructive
        : true,
    m3uEditorRememberFilters:
      typeof state.m3uEditorRememberFilters === 'boolean' ? state.m3uEditorRememberFilters : true,
    m3uEditorSidebarWidth: clampImageValue(state.m3uEditorSidebarWidth, 180, 360, 240),
    m3uEditorInspectorWidth: clampImageValue(state.m3uEditorInspectorWidth, 340, 620, 420),
    m3uHealthTimeoutMs: clampImageValue(state.m3uHealthTimeoutMs, 1_000, 30_000, 6_000),
    m3uHealthConcurrency: clampImageValue(state.m3uHealthConcurrency, 1, 12, 5),
    m3uPreserveUnknownTags:
      typeof state.m3uPreserveUnknownTags === 'boolean' ? state.m3uPreserveUnknownTags : true,
    imageSharpness: clampImageValue(state.imageSharpness, 0, 100, 0),
    imageBrightness: clampImageValue(state.imageBrightness, 0, 200, 100),
    imageContrast: clampImageValue(state.imageContrast, -100, 100, 0),
    imageSaturation: clampImageValue(state.imageSaturation, -100, 100, 0),
    imageHue: clampImageValue(state.imageHue, -100, 100, 0),
    imageGamma: clampImageValue(state.imageGamma, -100, 100, 0),
  } as SettingsState;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      updateSetting: (key, value) => set((state) => ({ ...state, [key]: value })),
      rememberPlayerVolume: (volume) =>
        set((state) => {
          if (!Number.isFinite(volume)) return state;
          const rememberedVolume = Math.max(0, Math.min(100, volume));
          return {
            rememberedVolume,
            lastAudibleVolume: rememberedVolume > 0 ? rememberedVolume : state.lastAudibleVolume,
          };
        }),

      toggleCategoryPref: (kind, type, id) =>
        set((state) => {
          const prefs = normalizeCategoryPrefs(state.categoryPrefs);
          const list = prefs[kind]?.[type] ?? [];
          const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
          return {
            categoryPrefs: {
              ...prefs,
              [kind]: { ...prefs[kind], [type]: next },
            },
          };
        }),
      setCollapsedCategories: (type, ids) =>
        set((state) => {
          const prefs = normalizeCategoryPrefs(state.categoryPrefs);
          return {
            categoryPrefs: {
              ...prefs,
              collapsed: {
                ...prefs.collapsed,
                [type]: [...new Set(ids)],
              },
            },
          };
        }),
      setSelectedCategory: (type, id) =>
        set((state) => ({
          selectedCategoryIds: {
            ...normalizeSelectedCategoryIds(state.selectedCategoryIds),
            [type]: typeof id === 'string' && id.length <= 512 ? id : null,
          },
        })),
      setCatalogSort: (type, sort) =>
        set((state) => ({
          catalogSortModes: {
            ...normalizeCatalogSortModes(state.catalogSortModes),
            [type]: sort,
          },
        })),

      addCustomTitleRule: (pattern, isRegex = false) =>
        set((state) => {
          const trimmed = pattern.trim();
          if (!trimmed) return state;
          const newRule: CustomTitleRule = {
            id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            pattern: trimmed,
            isRegex,
            enabled: true,
          };
          return {
            customTitleRules: [...state.customTitleRules, newRule],
          };
        }),

      removeCustomTitleRule: (id) =>
        set((state) => ({
          customTitleRules: state.customTitleRules.filter((r) => r.id !== id),
        })),

      toggleCustomTitleRule: (id) =>
        set((state) => ({
          customTitleRules: state.customTitleRules.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
          ),
        })),

      setBadgeVisibility: (key, visible) =>
        set((state) => ({
          badgeVisibility: {
            ...state.badgeVisibility,
            [key]: visible,
          },
        })),

      setSmartLogoAspectMode: (mode) => set((state) => ({ ...state, smartLogoAspectMode: mode })),

      setChannelLogoAspectOverride: (channelKey, aspect) =>
        set((state) => {
          const overrides = { ...state.channelLogoAspectOverrides };
          if (aspect === 'auto') {
            delete overrides[channelKey];
          } else {
            overrides[channelKey] = aspect;
          }
          return { channelLogoAspectOverrides: overrides };
        }),

      importSettings: (settings) => set(() => settings),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'iptv-settings-storage',
      version: 14,
      migrate: migrateSettingsState,
      partialize: ({ tmdbApiKey: _tmdbApiKey, ...persistedState }) => persistedState,
    },
  ),
);
