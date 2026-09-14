import type { M3uPlaylist } from '../data/m3uClient';
import type { M3uConnectionSecret } from '../services/m3uRepository';

/** Legacy singleton id, accepted only while upgrading older installations. */
export const XTREAM_SOURCE_ID = 'xtream';
export const SOURCE_PROFILES_STORAGE_KEY = 'movena-source-profiles-v1';
export const ENABLED_SOURCE_IDS_STORAGE_KEY = 'movena-enabled-sources-v1';
/** Read once when migrating the former single-source selection. */
export const ACTIVE_SOURCE_STORAGE_KEY = 'movena-active-source-v1';

export type M3uLocationType = 'remote' | 'local';
export type M3uEditorRefreshPolicy = 'preserve-edits' | 'replace-edits';

export interface M3uSourceProfile {
  id: string;
  kind: 'm3u';
  name: string;
  locationType: M3uLocationType;
  locationLabel: string;
  refreshIntervalMinutes: number;
  lastRefreshAt: number;
  entryCount: number;
  liveCount: number;
  vodCount: number;
  seriesCount: number;
  hasEpg: boolean;
  hasLocalEdits?: boolean | undefined;
  editorRefreshPolicy?: M3uEditorRefreshPolicy | undefined;
  editorWriteBack?: boolean | undefined;
}

export interface M3uSourceRuntime {
  connection: M3uConnectionSecret | null;
  playlist: M3uPlaylist | null;
  baseUrl?: string | undefined;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  revision: number;
}

export interface AddRemoteM3uInput {
  name: string;
  url: string;
  epgUrl?: string | undefined;
  userAgent?: string | undefined;
  referrer?: string | undefined;
  refreshIntervalMinutes?: number | undefined;
}

export interface AddLocalM3uInput {
  name: string;
  fileName: string;
  content: string;
  baseUrl?: string | undefined;
  path?: string | undefined;
  epgUrl?: string | undefined;
}

export interface UpdateLocalM3uInput {
  name: string;
  epgUrl?: string | undefined;
  fileName?: string | undefined;
  content?: string | undefined;
  baseUrl?: string | undefined;
  path?: string | undefined;
}

export function safeProfiles(): M3uSourceProfile[] {
  try {
    const raw = localStorage.getItem(SOURCE_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): M3uSourceProfile[] => {
      if (!value || typeof value !== 'object') return [];
      const profile = value as Partial<M3uSourceProfile>;
      if (
        profile.kind !== 'm3u' ||
        typeof profile.id !== 'string' ||
        !/^m3u-[a-z0-9-]{8,}$/i.test(profile.id) ||
        typeof profile.name !== 'string' ||
        (profile.locationType !== 'remote' && profile.locationType !== 'local')
      )
        return [];
      const finite = (number: unknown, fallback = 0) =>
        typeof number === 'number' && Number.isFinite(number) ? Math.max(0, number) : fallback;
      return [
        {
          id: profile.id,
          kind: 'm3u',
          name: profile.name.trim().slice(0, 120) || 'M3U Playlist',
          locationType: profile.locationType,
          locationLabel:
            typeof profile.locationLabel === 'string'
              ? profile.locationLabel.slice(0, 200)
              : 'Playlist',
          refreshIntervalMinutes: Math.max(15, finite(profile.refreshIntervalMinutes, 360)),
          lastRefreshAt: finite(profile.lastRefreshAt),
          entryCount: finite(profile.entryCount),
          liveCount: finite(profile.liveCount),
          vodCount: finite(profile.vodCount),
          seriesCount: finite(profile.seriesCount),
          hasEpg: profile.hasEpg === true,
          hasLocalEdits: profile.hasLocalEdits === true,
          editorRefreshPolicy:
            profile.editorRefreshPolicy === 'replace-edits' ? 'replace-edits' : 'preserve-edits',
          editorWriteBack: profile.editorWriteBack === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function writeProfiles(profiles: M3uSourceProfile[]): void {
  localStorage.setItem(SOURCE_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

export function readEnabledSourceIds(profiles: M3uSourceProfile[]): string[] {
  const valid = (id: unknown): id is string =>
    id === XTREAM_SOURCE_ID ||
    (typeof id === 'string' && /^xtream-[a-z0-9-]{6,}$/i.test(id)) ||
    (typeof id === 'string' && profiles.some((profile) => profile.id === id));
  const stored = localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY);
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) return [...new Set(parsed.filter(valid))];
    } catch {
      // Fall through to the legacy single-source selection.
    }
  }
  const legacy = localStorage.getItem(ACTIVE_SOURCE_STORAGE_KEY);
  const enabledSourceIds = valid(legacy) ? [legacy] : [];
  localStorage.setItem(ENABLED_SOURCE_IDS_STORAGE_KEY, JSON.stringify(enabledSourceIds));
  localStorage.removeItem(ACTIVE_SOURCE_STORAGE_KEY);
  return enabledSourceIds;
}

export function writeEnabledSourceIds(ids: string[]): void {
  localStorage.setItem(ENABLED_SOURCE_IDS_STORAGE_KEY, JSON.stringify(ids));
}

export function sourceId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `m3u-${uuid.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

export function normalizedRemoteUrl(value: string): string {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Playlist URLs must start with http:// or https://.');
  }
  return parsed.toString();
}

function publicLocationLabel(
  locationType: M3uLocationType,
  location: string,
  fileName?: string,
): string {
  if (locationType === 'local')
    return fileName || location.split(/[\\/]/).at(-1) || 'Local playlist';
  try {
    return new URL(location).host;
  } catch {
    return 'Remote playlist';
  }
}

export function createProfile(
  id: string,
  name: string,
  locationType: M3uLocationType,
  location: string,
  playlist: M3uPlaylist,
  epgUrl: string | undefined,
  refreshIntervalMinutes = 360,
  fileName?: string,
  hasLocalEdits = false,
  editorRefreshPolicy: M3uEditorRefreshPolicy = 'preserve-edits',
  editorWriteBack = false,
): M3uSourceProfile {
  const seriesIds = new Set(
    playlist.entries
      .filter((entry) => entry.type === 'series')
      .map((entry) => entry.episode?.seriesTitle || entry.groupTitle || entry.title),
  );
  return {
    id,
    kind: 'm3u',
    name: name.trim().slice(0, 120) || playlist.name?.slice(0, 120) || fileName || 'M3U Playlist',
    locationType,
    locationLabel: publicLocationLabel(locationType, location, fileName),
    refreshIntervalMinutes: Math.min(10_080, Math.max(15, refreshIntervalMinutes)),
    lastRefreshAt: Date.now(),
    entryCount: playlist.entries.length,
    liveCount: playlist.entries.filter((entry) => entry.type === 'live').length,
    vodCount: playlist.entries.filter((entry) => entry.type === 'vod').length,
    seriesCount: seriesIds.size,
    hasEpg: Boolean(epgUrl || playlist.epgUrls.length),
    hasLocalEdits,
    editorRefreshPolicy,
    editorWriteBack,
  };
}
