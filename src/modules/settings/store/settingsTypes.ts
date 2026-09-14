import type { AspectMode } from '@/modules/catalog/public/lib/aspect';
import type { UiLanguage, UiLocale } from '@/shared/i18n/config';
import type { CustomTitleRule } from '@/modules/catalog/public/lib/titleParser';
import type { HomeSectionPref } from '@/modules/catalog/public/lib/homeSections';
import type { ThemePreference } from '@/shared/design/appearance';

export type { ThemePreference } from '@/shared/design/appearance';

export type CatalogType = 'live' | 'vod' | 'series';
export type HwdecMode = 'auto' | 'auto-safe' | 'no';
export type HdrMode = 'auto' | 'off';
export type ToneMappingMode = 'auto' | 'hable' | 'reinhard' | 'mobius' | 'bt.2446a';
export type MotionPreference = 'system' | 'reduced' | 'full';
type TmdbLanguage = 'auto' | UiLocale;
type TmdbImageSize = 'w342' | 'w500' | 'w780';
export type UpcomingHistoryDays = 3 | 7 | 14 | 30;
export type SmartLogoAspectMode = 'auto' | 'force-16:9' | 'off';
export type ChannelLogoAspect = 'auto' | '16:9' | '4:3' | 'original';

export interface BadgeVisibilitySettings {
  resolution: boolean;
  fps: boolean;
  audio: boolean;
  edition: boolean;
  verified: boolean;
}

/** Which categories the user pinned, hid, or collapsed — kept per catalogue. */
export interface CategoryPrefs {
  pinned: Record<CatalogType, string[]>;
  hidden: Record<CatalogType, string[]>;
  collapsed: Record<CatalogType, string[]>;
  /** Whole country groups, keyed by country code (or `other`). */
  pinnedCountries: Record<CatalogType, string[]>;
  hiddenCountries: Record<CatalogType, string[]>;
}

export type SelectedCategoryIds = Record<CatalogType, string | null>;

export type CatalogSortMode =
  'default' | 'recently-added' | 'year-desc' | 'year-asc' | 'rating' | 'name-asc' | 'name-desc';

export type CatalogSortModes = Record<CatalogType, CatalogSortMode>;

export interface SettingsState {
  // Playback (mpv)
  hardwareAcceleration: boolean;
  hwdecMode: HwdecMode; // fine-grained hwdec override
  demuxerMaxBytes: string; // e.g. '150MiB'
  cacheSecs: number; // mpv --cache-secs
  seekJumpSecs: number; // seconds to seek forward/backward
  aspectRatio: AspectMode; // how the picture meets the window, applied live
  rememberedVolume: number; // last event-confirmed native volume, including mute at 0
  lastAudibleVolume: number; // level restored when unmuting
  rememberedPlaybackSpeed: number;
  subtitlesEnabled: boolean;
  autoPlayNextEpisode: boolean; // countdown-and-advance when a series episode ends
  skipIntroEnabled: boolean; // show Skip Intro action
  skipRecapEnabled: boolean; // show Skip Recap action
  autoSkipIntro: boolean; // automatically seek past intros/recaps without clicking
  introDbEnabled: boolean; // enable crowdsourced timestamps lookup from IntroDB
  audioDelayMs: number;
  subtitleFontSize: number;
  subtitleFontFamily: string;
  subtitleOpacity: number;
  subtitleBorderSize: number;
  subtitleShadowOffset: number;
  startupTimeoutMs: number;
  streamFailoverEnabled: boolean;
  maxStreamFailovers: number;
  language: UiLanguage;
  tmdbApiKey: string;
  tmdbEnabled: boolean;
  tmdbLanguage: TmdbLanguage;
  tmdbImageSize: TmdbImageSize;
  tmdbIncludeAdult: boolean;
  upcomingEnabled: boolean;
  upcomingHomeEnabled: boolean;
  upcomingCountdownEnabled: boolean;
  upcomingCalendarEnabled: boolean;
  upcomingExactTimesEnabled: boolean;
  upcomingHistoryDays: UpcomingHistoryDays;

  // Discover/home page layout
  homeSections: HomeSectionPref[];

  // Title Normalization & Stream Folding
  streamFoldingEnabled: boolean;
  customTitleRules: CustomTitleRule[];
  badgeVisibility: BadgeVisibilitySettings;

  // HDR & Color
  hdrMode: HdrMode; // HDR passthrough mode
  toneMappingMode: ToneMappingMode; // tone-mapping algorithm

  // Picture adjustments, applied live via mpv's video-equalizer properties.
  imageSharpness: number; // 0-100, 0 = off (mpv scale-blur pushed below neutral)
  imageBrightness: number; // 0-200%, 100 = neutral (mpv brightness -100..100)
  imageContrast: number; // -100..100, 0 = neutral (mpv contrast)
  imageSaturation: number; // -100..100, 0 = neutral (mpv saturation)
  imageHue: number; // -100..100, 0 = neutral (mpv hue)
  imageGamma: number; // -100..100, 0 = neutral (mpv gamma, "dark scene")

  // Playlist & EPG
  epgSource: 'provider' | 'xmltv';
  epgXmltvUrl: string;

  // M3U editor
  m3uEditorDensity: 'compact' | 'comfortable';
  m3uEditorAutosaveDrafts: boolean;
  m3uEditorConfirmDestructive: boolean;
  m3uEditorRememberFilters: boolean;
  m3uEditorSidebarWidth: number;
  m3uEditorInspectorWidth: number;
  m3uHealthTimeoutMs: number;
  m3uHealthConcurrency: number;
  m3uPreserveUnknownTags: boolean;

  // Category list, per catalogue type
  categoryPrefs: CategoryPrefs;
  selectedCategoryIds: SelectedCategoryIds;
  catalogSortModes: CatalogSortModes;

  // UI & Desktop
  sidebarWidth: number;
  viewMode: 'grid' | 'list';
  alwaysOnTop: boolean;
  accentColor: string;
  themePreference: ThemePreference;
  motionPreference: MotionPreference;
  onboardingDismissed: boolean;
  fourKDisclaimerDismissed: boolean;
  sidebarCollapsed: boolean;
  showCollapsedSidebarBadges: boolean;
  lastCollectionId: string | null;
  epgZoomPercent: number;

  // Recording
  recordingPath: string;
  instantRecord: boolean;

  // Downloads
  downloadDirectory: string;
  maxConcurrentDownloads: number;
  autoStartDownloads: boolean;

  // Notifications
  enableNotifications: boolean;
  toastPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  toastDurationSecs: number;
  dndDuringPlayback: boolean;
  notifyPlaybackEvents: boolean;
  notifyConnectionStatus: boolean;
  notifyLibraryUpdates: boolean;
  notifyDownloadEvents: boolean;
  notifySound: boolean;

  // Updates
  autoCheckUpdates: boolean;
  lastUpdateCheckTime: number | null;
  dismissedUpdateVersion: string | null;

  // Developer & Debug
  debugMode: boolean;
  showDebugOverlay: boolean;
  debugLogLevel: 'verbose' | 'info' | 'warn' | 'error';
  logApiRequests: boolean;

  // Live TV & Logo Aspect
  smartLogoAspectMode: SmartLogoAspectMode;
  channelLogoAspectOverrides: Record<string, ChannelLogoAspect>;

  // Actions
  updateSetting: <
    K extends keyof Omit<
      SettingsState,
      | 'updateSetting'
      | 'rememberPlayerVolume'
      | 'importSettings'
      | 'resetSettings'
      | 'toggleCategoryPref'
      | 'setCollapsedCategories'
      | 'setSelectedCategory'
      | 'setCatalogSort'
      | 'addCustomTitleRule'
      | 'removeCustomTitleRule'
      | 'toggleCustomTitleRule'
      | 'setBadgeVisibility'
      | 'setSmartLogoAspectMode'
      | 'setChannelLogoAspectOverride'
    >,
  >(
    key: K,
    value: SettingsState[K],
  ) => void;
  rememberPlayerVolume: (volume: number) => void;
  toggleCategoryPref: (kind: keyof CategoryPrefs, type: CatalogType, id: string) => void;
  setCollapsedCategories: (type: CatalogType, ids: string[]) => void;
  setSelectedCategory: (type: CatalogType, id: string | null) => void;
  setCatalogSort: (type: CatalogType, sort: CatalogSortMode) => void;
  addCustomTitleRule: (pattern: string, isRegex?: boolean) => void;
  removeCustomTitleRule: (id: string) => void;
  toggleCustomTitleRule: (id: string) => void;
  setBadgeVisibility: (key: keyof BadgeVisibilitySettings, visible: boolean) => void;
  setSmartLogoAspectMode: (mode: SmartLogoAspectMode) => void;
  setChannelLogoAspectOverride: (channelKey: string, aspect: ChannelLogoAspect) => void;
  importSettings: (settings: SettingsSnapshot) => void;
  resetSettings: () => void;
}

export const SETTINGS_SNAPSHOT_KEYS = [
  'hardwareAcceleration',
  'hwdecMode',
  'demuxerMaxBytes',
  'cacheSecs',
  'seekJumpSecs',
  'aspectRatio',
  'rememberedVolume',
  'lastAudibleVolume',
  'rememberedPlaybackSpeed',
  'subtitlesEnabled',
  'autoPlayNextEpisode',
  'skipIntroEnabled',
  'skipRecapEnabled',
  'autoSkipIntro',
  'introDbEnabled',
  'audioDelayMs',
  'subtitleFontSize',
  'subtitleFontFamily',
  'subtitleOpacity',
  'subtitleBorderSize',
  'subtitleShadowOffset',
  'startupTimeoutMs',
  'streamFailoverEnabled',
  'maxStreamFailovers',
  'language',
  'hdrMode',
  'toneMappingMode',
  'tmdbEnabled',
  'tmdbLanguage',
  'tmdbImageSize',
  'tmdbIncludeAdult',
  'upcomingEnabled',
  'upcomingHomeEnabled',
  'upcomingCountdownEnabled',
  'upcomingCalendarEnabled',
  'upcomingExactTimesEnabled',
  'upcomingHistoryDays',
  'homeSections',
  'streamFoldingEnabled',
  'customTitleRules',
  'badgeVisibility',
  'smartLogoAspectMode',
  'imageSharpness',
  'imageBrightness',
  'imageContrast',
  'imageSaturation',
  'imageHue',
  'imageGamma',
  'epgSource',
  'm3uEditorDensity',
  'm3uEditorAutosaveDrafts',
  'm3uEditorConfirmDestructive',
  'm3uEditorRememberFilters',
  'm3uEditorSidebarWidth',
  'm3uEditorInspectorWidth',
  'm3uHealthTimeoutMs',
  'm3uHealthConcurrency',
  'm3uPreserveUnknownTags',
  'sidebarWidth',
  'viewMode',
  'alwaysOnTop',
  'accentColor',
  'themePreference',
  'motionPreference',
  'showCollapsedSidebarBadges',
  'recordingPath',
  'instantRecord',
  'downloadDirectory',
  'maxConcurrentDownloads',
  'autoStartDownloads',
  'enableNotifications',
  'toastPosition',
  'toastDurationSecs',
  'dndDuringPlayback',
  'notifyPlaybackEvents',
  'notifyConnectionStatus',
  'notifyLibraryUpdates',
  'notifyDownloadEvents',
  'notifySound',
  'autoCheckUpdates',
] as const satisfies readonly (keyof SettingsState)[];

type SettingsSnapshotKey = (typeof SETTINGS_SNAPSHOT_KEYS)[number];
export type SettingsSnapshot = Pick<SettingsState, SettingsSnapshotKey>;
