import { desktopApi } from '@/platform/desktop';
import { tauriApi } from '@/platform/tauri';
import { UI_LANGUAGES, UI_LOCALES } from '@/shared/i18n/config';
import {
  getSettingsSnapshot,
  migrateSettingsState,
  SETTINGS_SNAPSHOT_KEYS,
  type SettingsSnapshot,
  type SettingsState,
} from '../store/useSettingsStore';

export const SETTINGS_CONFIG_FORMAT = 'movena.settings';
export const SETTINGS_CONFIG_VERSION = 1;
export const MAX_SETTINGS_CONFIG_BYTES = 1024 * 1024;

export interface SettingsConfigDocument {
  format: typeof SETTINGS_CONFIG_FORMAT;
  version: typeof SETTINGS_CONFIG_VERSION;
  exportedAt: string;
  settings: SettingsSnapshot;
}

export interface ParsedSettingsConfig {
  document: SettingsConfigDocument;
  ignoredKeys: string[];
}

export interface SelectedSettingsConfig extends ParsedSettingsConfig {
  fileName: string;
}

const oneOf = <T extends string | number>(value: unknown, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const numberOr = (value: unknown, fallback: number, minimum: number, maximum: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;

const stringOr = (value: unknown, fallback: string, maximumLength: number): string =>
  typeof value === 'string' ? value.slice(0, maximumLength) : fallback;

/**
 * Import validation is deliberately stricter than Zustand hydration. Values
 * outside the controls Movena exposes fall back to a known-safe equivalent.
 */
export function sanitizeSettingsConfig(value: unknown): SettingsSnapshot {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const migrated = migrateSettingsState(source);

  return {
    hardwareAcceleration: booleanOr(source.hardwareAcceleration, true),
    hwdecMode: oneOf(source.hwdecMode, ['auto', 'auto-safe', 'no'] as const, 'auto-safe'),
    demuxerMaxBytes: oneOf(
      source.demuxerMaxBytes,
      ['50MiB', '150MiB', '300MiB', '500MiB'] as const,
      '150MiB',
    ),
    cacheSecs: oneOf(source.cacheSecs, [3, 5, 10, 15, 30] as const, 30),
    seekJumpSecs: oneOf(source.seekJumpSecs, [5, 10, 15, 30, 60] as const, 10),
    aspectRatio: oneOf(
      source.aspectRatio,
      ['auto', 'fit100', 'stretch', 'zoom', 'fitScreen', '16:9', '4:3', '1:1', '5:4'] as const,
      'auto',
    ),
    rememberedVolume: numberOr(source.rememberedVolume, migrated.rememberedVolume, 0, 100),
    lastAudibleVolume: numberOr(source.lastAudibleVolume, migrated.lastAudibleVolume, 1, 100),
    rememberedPlaybackSpeed: numberOr(
      source.rememberedPlaybackSpeed,
      migrated.rememberedPlaybackSpeed,
      0.5,
      2,
    ),
    subtitlesEnabled: booleanOr(source.subtitlesEnabled, migrated.subtitlesEnabled),
    autoPlayNextEpisode: booleanOr(source.autoPlayNextEpisode, true),
    skipIntroEnabled: booleanOr(source.skipIntroEnabled, true),
    skipRecapEnabled: booleanOr(source.skipRecapEnabled, true),
    autoSkipIntro: booleanOr(source.autoSkipIntro, false),
    introDbEnabled: booleanOr(source.introDbEnabled, true),
    audioDelayMs: numberOr(source.audioDelayMs, migrated.audioDelayMs, -5000, 5000),
    subtitleFontSize: numberOr(source.subtitleFontSize, migrated.subtitleFontSize, 12, 96),
    subtitleFontFamily: stringOr(source.subtitleFontFamily, migrated.subtitleFontFamily, 80),
    subtitleOpacity: numberOr(source.subtitleOpacity, migrated.subtitleOpacity, 0, 100),
    subtitleBorderSize: numberOr(source.subtitleBorderSize, migrated.subtitleBorderSize, 0, 12),
    subtitleShadowOffset: numberOr(
      source.subtitleShadowOffset,
      migrated.subtitleShadowOffset,
      0,
      12,
    ),
    startupTimeoutMs: numberOr(source.startupTimeoutMs, migrated.startupTimeoutMs, 5000, 120000),
    streamFailoverEnabled: booleanOr(source.streamFailoverEnabled, migrated.streamFailoverEnabled),
    maxStreamFailovers: numberOr(source.maxStreamFailovers, migrated.maxStreamFailovers, 0, 5),
    language: oneOf(source.language, UI_LANGUAGES, 'en'),
    tmdbEnabled: booleanOr(source.tmdbEnabled, migrated.tmdbEnabled),
    tmdbLanguage: oneOf(source.tmdbLanguage, ['auto', ...UI_LOCALES] as const, 'auto'),
    tmdbImageSize: oneOf(source.tmdbImageSize, ['w342', 'w500', 'w780'] as const, 'w500'),
    tmdbIncludeAdult: booleanOr(source.tmdbIncludeAdult, false),
    upcomingEnabled: booleanOr(source.upcomingEnabled, migrated.upcomingEnabled),
    upcomingHomeEnabled: booleanOr(source.upcomingHomeEnabled, migrated.upcomingHomeEnabled),
    upcomingCountdownEnabled: booleanOr(
      source.upcomingCountdownEnabled,
      migrated.upcomingCountdownEnabled,
    ),
    upcomingCalendarEnabled: booleanOr(
      source.upcomingCalendarEnabled,
      migrated.upcomingCalendarEnabled,
    ),
    upcomingExactTimesEnabled: booleanOr(
      source.upcomingExactTimesEnabled,
      migrated.upcomingExactTimesEnabled,
    ),
    upcomingHistoryDays: oneOf(
      source.upcomingHistoryDays,
      [3, 7, 14, 30] as const,
      migrated.upcomingHistoryDays,
    ),
    homeSections: migrated.homeSections,
    streamFoldingEnabled: booleanOr(source.streamFoldingEnabled, migrated.streamFoldingEnabled),
    customTitleRules: migrated.customTitleRules,
    badgeVisibility: migrated.badgeVisibility,
    smartLogoAspectMode: oneOf(
      source.smartLogoAspectMode,
      ['auto', 'force-16:9', 'off'] as const,
      migrated.smartLogoAspectMode,
    ),
    hdrMode: oneOf(source.hdrMode, ['auto', 'off'] as const, migrated.hdrMode),
    toneMappingMode: oneOf(
      source.toneMappingMode,
      ['auto', 'hable', 'reinhard', 'mobius', 'bt.2446a'] as const,
      'auto',
    ),
    imageSharpness: numberOr(source.imageSharpness, migrated.imageSharpness, 0, 100),
    imageBrightness: numberOr(source.imageBrightness, migrated.imageBrightness, 0, 200),
    imageContrast: numberOr(source.imageContrast, migrated.imageContrast, -100, 100),
    imageSaturation: numberOr(source.imageSaturation, migrated.imageSaturation, -100, 100),
    imageHue: numberOr(source.imageHue, migrated.imageHue, -100, 100),
    imageGamma: numberOr(source.imageGamma, migrated.imageGamma, -100, 100),
    epgSource: oneOf(source.epgSource, ['provider', 'xmltv'] as const, 'provider'),
    m3uEditorDensity: oneOf(
      source.m3uEditorDensity,
      ['compact', 'comfortable'] as const,
      'comfortable',
    ),
    m3uEditorAutosaveDrafts: booleanOr(source.m3uEditorAutosaveDrafts, true),
    m3uEditorConfirmDestructive: booleanOr(source.m3uEditorConfirmDestructive, true),
    m3uEditorRememberFilters: booleanOr(source.m3uEditorRememberFilters, true),
    m3uEditorSidebarWidth: numberOr(source.m3uEditorSidebarWidth, 240, 180, 360),
    m3uEditorInspectorWidth: numberOr(source.m3uEditorInspectorWidth, 420, 340, 620),
    m3uHealthTimeoutMs: numberOr(source.m3uHealthTimeoutMs, 6000, 1000, 30000),
    m3uHealthConcurrency: numberOr(source.m3uHealthConcurrency, 5, 1, 12),
    m3uPreserveUnknownTags: booleanOr(source.m3uPreserveUnknownTags, true),
    sidebarWidth: numberOr(source.sidebarWidth, 260, 180, 520),
    viewMode: oneOf(source.viewMode, ['grid', 'list'] as const, 'grid'),
    alwaysOnTop: booleanOr(source.alwaysOnTop, false),
    accentColor: migrated.accentColor,
    themePreference: oneOf(source.themePreference, ['dark', 'light'] as const, 'dark'),
    motionPreference: oneOf(
      source.motionPreference,
      ['system', 'reduced', 'full'] as const,
      'system',
    ),
    showCollapsedSidebarBadges: booleanOr(source.showCollapsedSidebarBadges, true),
    recordingPath: stringOr(migrated.recordingPath, 'Movena Recordings', 4096),
    instantRecord: booleanOr(source.instantRecord, false),
    downloadDirectory: stringOr(migrated.downloadDirectory, '', 4096),
    maxConcurrentDownloads: numberOr(
      source.maxConcurrentDownloads,
      migrated.maxConcurrentDownloads,
      1,
      8,
    ),
    autoStartDownloads: booleanOr(source.autoStartDownloads, true),
    enableNotifications: booleanOr(source.enableNotifications, true),
    toastPosition: oneOf(
      source.toastPosition,
      ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const,
      'top-right',
    ),
    toastDurationSecs: oneOf(source.toastDurationSecs, [3, 4.5, 7, 10] as const, 4.5),
    dndDuringPlayback: booleanOr(source.dndDuringPlayback, true),
    notifyPlaybackEvents: booleanOr(source.notifyPlaybackEvents, true),
    notifyConnectionStatus: booleanOr(source.notifyConnectionStatus, true),
    notifyLibraryUpdates: booleanOr(source.notifyLibraryUpdates, true),
    notifyDownloadEvents: booleanOr(source.notifyDownloadEvents, true),
    notifySound: booleanOr(source.notifySound, false),
    autoCheckUpdates: booleanOr(source.autoCheckUpdates, true),
  };
}

export function createSettingsConfig(
  state: SettingsState,
  exportedAt = new Date().toISOString(),
): SettingsConfigDocument {
  return {
    format: SETTINGS_CONFIG_FORMAT,
    version: SETTINGS_CONFIG_VERSION,
    exportedAt,
    settings: sanitizeSettingsConfig(getSettingsSnapshot(state)),
  };
}

export function serializeSettingsConfig(state: SettingsState): string {
  return `${JSON.stringify(createSettingsConfig(state), null, 2)}\n`;
}

export function parseSettingsConfig(text: string): ParsedSettingsConfig {
  if (new TextEncoder().encode(text).byteLength > MAX_SETTINGS_CONFIG_BYTES) {
    throw new Error('This settings file is larger than Movena supports.');
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('This is not a valid JSON settings file.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This file does not contain a Movena settings backup.');
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.format !== SETTINGS_CONFIG_FORMAT) {
    throw new Error('This file is not a Movena settings backup.');
  }
  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version < 1
  ) {
    throw new Error('This settings file has an invalid format version.');
  }
  if (candidate.version > SETTINGS_CONFIG_VERSION) {
    throw new Error('This settings file was created by a newer version of Movena.');
  }
  if (
    !candidate.settings ||
    typeof candidate.settings !== 'object' ||
    Array.isArray(candidate.settings)
  ) {
    throw new Error('This settings file is missing its preferences.');
  }

  const exportedAt =
    typeof candidate.exportedAt === 'string' && Number.isFinite(Date.parse(candidate.exportedAt))
      ? new Date(candidate.exportedAt).toISOString()
      : new Date(0).toISOString();
  const rawSettings = candidate.settings as Record<string, unknown>;
  const knownKeys = new Set<string>(SETTINGS_SNAPSHOT_KEYS);

  return {
    document: {
      format: SETTINGS_CONFIG_FORMAT,
      version: SETTINGS_CONFIG_VERSION,
      exportedAt,
      settings: sanitizeSettingsConfig(rawSettings),
    },
    ignoredKeys: Object.keys(rawSettings).filter((key) => !knownKeys.has(key)),
  };
}

export function countChangedSettings(current: SettingsState, imported: SettingsSnapshot): number {
  const currentSnapshot = getSettingsSnapshot(current);
  return SETTINGS_SNAPSHOT_KEYS.filter(
    (key) => JSON.stringify(currentSnapshot[key]) !== JSON.stringify(imported[key]),
  ).length;
}

function backupFileName(date = new Date()): string {
  return `movena-settings-${date.toISOString().slice(0, 10)}.json`;
}

export async function saveSettingsConfig(state: SettingsState): Promise<string | null> {
  const content = serializeSettingsConfig(state);
  const fileName = backupFileName();
  const path = await desktopApi.savePath({
    defaultPath: fileName,
    filters: [{ name: 'Movena settings', extensions: ['json'] }],
  });
  if (!path) return null;
  await tauriApi.settingsConfigWrite(path, content);
  return path.split(/[\\/]/).at(-1) || fileName;
}

export async function selectSettingsConfig(): Promise<SelectedSettingsConfig | null> {
  const path = await desktopApi.openPath({
    multiple: false,
    filters: [{ name: 'Movena settings', extensions: ['json'] }],
  });
  if (!path || Array.isArray(path)) return null;
  const selected = {
    fileName: path.split(/[\\/]/).at(-1) || 'Movena settings',
    content: await tauriApi.settingsConfigRead(path),
  };
  return { fileName: selected.fileName, ...parseSettingsConfig(selected.content) };
}
