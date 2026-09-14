import { create } from 'zustand';
import type { M3uDocument } from '@/platform/tauri';
import { generateM3u, type M3uPlaylist } from '../data/m3uClient';
import {
  deleteM3uCache,
  deleteM3uConnection,
  fetchRemoteM3u,
  loadM3uCache,
  loadM3uConnection,
  readLocalM3u,
  storeM3uCache,
  storeM3uConnection,
  writeLocalM3u,
  type M3uConnectionSecret,
} from '../services/m3uRepository';
import { invalidateSourceQueries } from '@/shared/query/queryClient';
import { deleteM3uDraft } from '@/modules/m3u-editor/public/services/m3uDraftRepository';
import { clearM3uVersions } from '@/modules/m3u-editor/public/services/m3uVersionHistory';
import { parseM3uAsync } from '@/modules/m3u-editor/public/services/m3uParser';
import { getErrorMessage } from '@/shared/lib/error';
import {
  createProfile,
  ENABLED_SOURCE_IDS_STORAGE_KEY,
  readEnabledSourceIds,
  safeProfiles,
  sourceId,
  normalizedRemoteUrl,
  writeEnabledSourceIds,
  writeProfiles,
  XTREAM_SOURCE_ID,
  type AddLocalM3uInput,
  type AddRemoteM3uInput,
  type M3uEditorRefreshPolicy,
  type M3uSourceProfile,
  type M3uSourceRuntime,
  type UpdateLocalM3uInput,
} from '../model/sourceProfiles';

export {
  ACTIVE_SOURCE_STORAGE_KEY,
  ENABLED_SOURCE_IDS_STORAGE_KEY,
  SOURCE_PROFILES_STORAGE_KEY,
} from '../model/sourceProfiles';
export type { M3uSourceProfile, M3uSourceRuntime } from '../model/sourceProfiles';

interface SourceState {
  profiles: M3uSourceProfile[];
  runtimes: Record<string, M3uSourceRuntime>;
  enabledSourceIds: string[];
  isInitializing: boolean;
  initializationError: string | null;
  initialize: () => Promise<void>;
  setSourceEnabled: (sourceId: string, enabled: boolean) => void;
  replaceEnabledSourceId: (previousId: string, nextId: string) => void;
  addRemoteSource: (input: AddRemoteM3uInput) => Promise<M3uSourceProfile>;
  addLocalSource: (input: AddLocalM3uInput) => Promise<M3uSourceProfile>;
  addLocalPath: (name: string, path: string, epgUrl?: string) => Promise<M3uSourceProfile>;
  updateRemoteSource: (sourceId: string, input: AddRemoteM3uInput) => Promise<M3uSourceProfile>;
  updateLocalSource: (sourceId: string, input: UpdateLocalM3uInput) => Promise<M3uSourceProfile>;
  saveEditedSource: (sourceId: string, content: string, name?: string) => Promise<M3uSourceProfile>;
  refreshSource: (sourceId: string) => Promise<void>;
  refreshStaleSources: () => Promise<void>;
  setEditorRefreshPolicy: (sourceId: string, policy: M3uEditorRefreshPolicy) => void;
  setEditorWriteBack: (sourceId: string, enabled: boolean) => void;
  removeSource: (sourceId: string) => Promise<void>;
}

const emptyRuntime = (): M3uSourceRuntime => ({
  connection: null,
  playlist: null,
  status: 'idle',
  error: null,
  revision: 0,
});

function parseDocument(
  id: string,
  document: M3uDocument,
  headers?: Record<string, string>,
): Promise<M3uPlaylist> {
  return parseM3uAsync(document.content, {
    sourceId: id,
    baseUrl: document.baseUrl || undefined,
    headers,
  });
}

function errorMessage(error: unknown): string {
  return getErrorMessage(error, 'Source operation failed without an error message.');
}

type SourceStateReader = () => SourceState;
type SourceStateWriter = (
  partial: Partial<SourceState> | ((state: SourceState) => Partial<SourceState>),
) => void;

async function commitNewSource(
  get: SourceStateReader,
  set: SourceStateWriter,
  id: string,
  profile: M3uSourceProfile,
  connection: M3uConnectionSecret,
  playlist: M3uPlaylist,
  document: M3uDocument,
): Promise<void> {
  try {
    await storeM3uConnection(id, connection);
    await storeM3uCache(id, document);
  } catch (error: unknown) {
    await Promise.allSettled([deleteM3uConnection(id), deleteM3uCache(id)]);
    throw error;
  }

  const previousProfiles = get().profiles;
  const previousEnabledSourceIds = get().enabledSourceIds;
  const profiles = [...previousProfiles, profile];
  const enabledSourceIds = [...new Set([...previousEnabledSourceIds, id])];
  try {
    writeProfiles(profiles);
    writeEnabledSourceIds(enabledSourceIds);
  } catch (error) {
    try {
      writeProfiles(previousProfiles);
    } catch {
      /* best-effort local rollback */
    }
    try {
      writeEnabledSourceIds(previousEnabledSourceIds);
    } catch {
      /* best-effort local rollback */
    }
    await Promise.allSettled([deleteM3uConnection(id), deleteM3uCache(id)]);
    throw error;
  }

  set((state) => ({
    profiles,
    enabledSourceIds,
    runtimes: {
      ...state.runtimes,
      [id]: {
        connection,
        playlist,
        baseUrl: document.baseUrl || undefined,
        status: 'ready',
        error: null,
        revision: 1,
      },
    },
  }));
  void invalidateSourceQueries();
}

async function persistSourceUpdate(
  id: string,
  connection: M3uConnectionSecret,
  document: M3uDocument | null,
  previousConnection: M3uConnectionSecret,
  previousCache: M3uDocument | null,
  profiles: M3uSourceProfile[],
): Promise<void> {
  try {
    await storeM3uConnection(id, connection);
    if (document) await storeM3uCache(id, document);
    writeProfiles(profiles);
  } catch (error) {
    await storeM3uConnection(id, previousConnection).catch(() => undefined);
    if (document) {
      if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
      else await deleteM3uCache(id).catch(() => undefined);
    }
    throw error;
  }
}

let initialization: Promise<void> | null = null;

export const useSourceStore = create<SourceState>((set, get) => ({
  profiles: [],
  runtimes: {},
  enabledSourceIds: [],
  isInitializing: true,
  initializationError: null,

  initialize: async () => {
    if (initialization) return initialization;
    initialization = (async () => {
      set({ isInitializing: true, initializationError: null });
      const profiles = safeProfiles();
      const enabledSourceIds = readEnabledSourceIds(profiles);
      const runtimes: Record<string, M3uSourceRuntime> = Object.fromEntries(
        profiles.map((profile) => [profile.id, { ...emptyRuntime(), status: 'loading' }]),
      );
      set({ profiles, enabledSourceIds, runtimes });

      await Promise.all(
        profiles.map(async (profile) => {
          try {
            const [connection, cached] = await Promise.all([
              loadM3uConnection(profile.id),
              loadM3uCache(profile.id),
            ]);
            const playlist = cached
              ? await parseDocument(profile.id, cached, connection?.headers)
              : null;
            set((state) => ({
              runtimes: {
                ...state.runtimes,
                [profile.id]: {
                  connection,
                  playlist,
                  baseUrl: cached?.baseUrl || undefined,
                  status: playlist ? 'ready' : 'idle',
                  error: connection || playlist ? null : 'The playlist connection is unavailable',
                  revision: playlist ? 1 : 0,
                },
              },
            }));
          } catch (error: unknown) {
            set((state) => ({
              runtimes: {
                ...state.runtimes,
                [profile.id]: {
                  ...emptyRuntime(),
                  status: 'error',
                  error: errorMessage(error),
                },
              },
            }));
          }
        }),
      );

      set({ isInitializing: false });
    })()
      .catch((error: unknown) => {
        set({ isInitializing: false, initializationError: errorMessage(error) });
      })
      .finally(() => {
        initialization = null;
      });
    return initialization;
  },

  setSourceEnabled: (id, enabled) => {
    if (
      id !== XTREAM_SOURCE_ID &&
      !id.startsWith('xtream-') &&
      !get().profiles.some((profile) => profile.id === id)
    )
      return;
    const enabledSourceIds = enabled
      ? [...new Set([...get().enabledSourceIds, id])]
      : get().enabledSourceIds.filter((candidate) => candidate !== id);
    writeEnabledSourceIds(enabledSourceIds);
    set({ enabledSourceIds });
    void invalidateSourceQueries();
  },

  setEditorRefreshPolicy: (id, policy) => {
    const profiles = get().profiles.map((profile) =>
      profile.id === id ? { ...profile, editorRefreshPolicy: policy } : profile,
    );
    writeProfiles(profiles);
    set({ profiles });
  },

  setEditorWriteBack: (id, enabled) => {
    const profiles = get().profiles.map((profile) =>
      profile.id === id ? { ...profile, editorWriteBack: enabled } : profile,
    );
    writeProfiles(profiles);
    set({ profiles });
  },

  replaceEnabledSourceId: (previousId, nextId) => {
    let stored: string[] = [];
    try {
      const parsed = JSON.parse(
        localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY) || '[]',
      ) as unknown;
      if (Array.isArray(parsed))
        stored = parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      // The in-memory selection is still usable.
    }
    const current = [...new Set([...get().enabledSourceIds, ...stored])];
    const shouldEnable = current.includes(previousId);
    const enabledSourceIds = [
      ...new Set([...current.filter((id) => id !== previousId), ...(shouldEnable ? [nextId] : [])]),
    ];
    writeEnabledSourceIds(enabledSourceIds);
    set({ enabledSourceIds });
    void invalidateSourceQueries();
  },

  addRemoteSource: async (input) => {
    const id = sourceId();
    const location = normalizedRemoteUrl(input.url);
    const epgUrl = input.epgUrl?.trim() ? normalizedRemoteUrl(input.epgUrl) : undefined;
    const headers: Record<string, string> = {};
    if (input.userAgent?.trim()) headers['User-Agent'] = input.userAgent.trim();
    if (input.referrer?.trim()) headers.Referer = input.referrer.trim();
    const connection: M3uConnectionSecret = { location, epgUrl, headers };
    const document = await fetchRemoteM3u(connection, id);
    const playlist = await parseDocument(id, document, connection.headers);
    const profile = createProfile(
      id,
      input.name,
      'remote',
      location,
      playlist,
      epgUrl,
      input.refreshIntervalMinutes,
    );

    await commitNewSource(get, set, id, profile, connection, playlist, document);
    return profile;
  },

  addLocalSource: async (input) => {
    const id = sourceId();
    const document: M3uDocument = {
      content: input.content,
      baseUrl: input.baseUrl || '',
      fileName: input.fileName,
    };
    const playlist = await parseDocument(id, document);
    const connection: M3uConnectionSecret = {
      location: input.path || input.fileName,
      epgUrl: input.epgUrl?.trim() || undefined,
    };
    const profile = createProfile(
      id,
      input.name,
      'local',
      connection.location,
      playlist,
      connection.epgUrl,
      10_080,
      input.fileName,
    );
    await commitNewSource(get, set, id, profile, connection, playlist, document);
    return profile;
  },

  addLocalPath: async (name, path, epgUrl) => {
    const document = await readLocalM3u(path);
    return get().addLocalSource({
      name,
      path,
      epgUrl,
      fileName: document.fileName || path.split(/[\\/]/).at(-1) || 'playlist.m3u',
      content: document.content,
      baseUrl: document.baseUrl,
    });
  },

  updateRemoteSource: async (id, input) => {
    const previous = get().profiles.find(
      (profile) => profile.id === id && profile.locationType === 'remote',
    );
    const previousRuntime = get().runtimes[id];
    if (!previous || !previousRuntime?.connection || !previousRuntime.playlist)
      throw new Error('Remote playlist not found');
    const location = normalizedRemoteUrl(input.url);
    const epgUrl = input.epgUrl?.trim() ? normalizedRemoteUrl(input.epgUrl) : undefined;
    const headers: Record<string, string> = {};
    if (input.userAgent?.trim()) headers['User-Agent'] = input.userAgent.trim();
    if (input.referrer?.trim()) headers.Referer = input.referrer.trim();
    const connection: M3uConnectionSecret = { location, epgUrl, headers };
    const transportChanged =
      location !== previousRuntime.connection.location ||
      JSON.stringify(headers) !== JSON.stringify(previousRuntime.connection.headers ?? {});
    if (
      transportChanged &&
      previous.hasLocalEdits &&
      previous.editorRefreshPolicy !== 'replace-edits'
    ) {
      throw new Error(
        'This source has edited channels. Allow refresh replacement before changing its playlist URL or request headers.',
      );
    }
    const document = transportChanged ? await fetchRemoteM3u(connection, id) : null;
    const playlist = document
      ? await parseDocument(id, document, headers)
      : previousRuntime.playlist;
    const replacingPlaylist = document !== null;
    const profile = createProfile(
      id,
      input.name,
      'remote',
      location,
      playlist,
      epgUrl,
      input.refreshIntervalMinutes ?? previous.refreshIntervalMinutes,
      previous.locationLabel,
      replacingPlaylist ? false : previous.hasLocalEdits === true,
      previous.editorRefreshPolicy || 'preserve-edits',
      previous.editorWriteBack === true,
    );
    const previousCache = document ? await loadM3uCache(id) : null;
    const profiles = get().profiles.map((candidate) => (candidate.id === id ? profile : candidate));
    const runtimes = {
      ...get().runtimes,
      [id]: {
        connection,
        playlist,
        baseUrl: document?.baseUrl || previousRuntime.baseUrl,
        status: 'ready' as const,
        error: null,
        revision: (get().runtimes[id]?.revision ?? 0) + 1,
      },
    };
    await persistSourceUpdate(
      id,
      connection,
      document,
      previousRuntime.connection,
      previousCache,
      profiles,
    );
    set({ profiles, runtimes });
    void invalidateSourceQueries();
    return profile;
  },

  updateLocalSource: async (id, input) => {
    const previous = get().profiles.find(
      (profile) => profile.id === id && profile.locationType === 'local',
    );
    const previousRuntime = get().runtimes[id];
    if (!previous || !previousRuntime?.connection || !previousRuntime.playlist) {
      throw new Error('Local playlist not found');
    }
    let document: M3uDocument | null = null;
    if (input.content !== undefined) {
      document = {
        content: input.content,
        baseUrl: input.baseUrl ?? previousRuntime.baseUrl ?? '',
        fileName: input.fileName || previous.locationLabel,
      };
    } else if (input.path && input.path !== previousRuntime.connection.location) {
      if (previous.hasLocalEdits && previous.editorRefreshPolicy !== 'replace-edits') {
        throw new Error(
          'This source has edited channels. Allow refresh replacement before choosing a different playlist file.',
        );
      }
      document = await readLocalM3u(input.path);
    }
    const location = input.path || previousRuntime.connection.location;
    const connection: M3uConnectionSecret = {
      location,
      epgUrl: input.epgUrl?.trim() || undefined,
    };
    const playlist = document ? await parseDocument(id, document) : previousRuntime.playlist;
    const profile = createProfile(
      id,
      input.name,
      'local',
      location,
      playlist,
      connection.epgUrl,
      previous.refreshIntervalMinutes,
      document?.fileName || input.fileName || previous.locationLabel,
      document ? false : previous.hasLocalEdits === true,
      previous.editorRefreshPolicy || 'preserve-edits',
      previous.editorWriteBack === true,
    );
    const previousCache = document ? await loadM3uCache(id) : null;
    const profiles = get().profiles.map((candidate) => (candidate.id === id ? profile : candidate));
    const runtimes = {
      ...get().runtimes,
      [id]: {
        connection,
        playlist,
        baseUrl: document?.baseUrl || previousRuntime.baseUrl,
        status: 'ready' as const,
        error: null,
        revision: (previousRuntime.revision ?? 0) + 1,
      },
    };
    await persistSourceUpdate(
      id,
      connection,
      document,
      previousRuntime.connection,
      previousCache,
      profiles,
    );
    set({ profiles, runtimes });
    void invalidateSourceQueries();
    return profile;
  },

  saveEditedSource: async (id, content, name) => {
    const profile = get().profiles.find((candidate) => candidate.id === id);
    const runtime = get().runtimes[id];
    if (!profile || !runtime?.connection) throw new Error('The playlist is not available');

    const document: M3uDocument = {
      content,
      baseUrl:
        runtime.baseUrl ||
        (runtime.connection.location.startsWith('http') ? runtime.connection.location : ''),
      fileName: profile.locationLabel,
    };
    const playlist = await parseDocument(id, document, runtime.connection.headers);
    const previousCache =
      (await loadM3uCache(id)) ??
      (runtime.playlist
        ? {
            content: generateM3u(runtime.playlist),
            baseUrl: runtime.baseUrl ?? '',
            fileName: profile.locationLabel,
          }
        : null);

    const updatedProfile = createProfile(
      id,
      name || profile.name,
      profile.locationType,
      runtime.connection.location,
      playlist,
      runtime.connection.epgUrl,
      profile.refreshIntervalMinutes,
      profile.locationLabel,
      true,
      profile.editorRefreshPolicy || 'preserve-edits',
      profile.editorWriteBack === true,
    );

    const profiles = get().profiles.map((candidate) =>
      candidate.id === id ? updatedProfile : candidate,
    );
    try {
      if (profile.locationType === 'local' && profile.editorWriteBack) {
        await writeLocalM3u(runtime.connection.location, content);
      }
      await storeM3uCache(id, document);
      writeProfiles(profiles);
    } catch (error) {
      if (previousCache) {
        await storeM3uCache(id, previousCache).catch(() => undefined);
        if (profile.locationType === 'local' && profile.editorWriteBack) {
          await writeLocalM3u(runtime.connection.location, previousCache.content).catch(
            () => undefined,
          );
        }
      } else {
        await deleteM3uCache(id).catch(() => undefined);
      }
      throw error;
    }

    set((state) => ({
      profiles,
      runtimes: {
        ...state.runtimes,
        [id]: {
          ...runtime,
          playlist,
          baseUrl: document.baseUrl || runtime.baseUrl,
          status: 'ready',
          error: null,
          revision: (state.runtimes[id]?.revision ?? 0) + 1,
        },
      },
    }));

    void invalidateSourceQueries();
    return updatedProfile;
  },

  refreshSource: async (id) => {
    const profile = get().profiles.find((candidate) => candidate.id === id);
    const runtime = get().runtimes[id];
    if (!profile || !runtime?.connection) throw new Error('The playlist connection is unavailable');
    if (profile.hasLocalEdits && profile.editorRefreshPolicy === 'preserve-edits') {
      throw new Error(
        'This source has edited channels. Change its editor refresh policy before replacing them with the remote playlist.',
      );
    }
    set((state) => ({
      runtimes: {
        ...state.runtimes,
        [id]: { ...runtime, status: 'loading', error: null },
      },
    }));
    try {
      const document =
        profile.locationType === 'remote'
          ? await fetchRemoteM3u(runtime.connection, id)
          : await readLocalM3u(runtime.connection.location);
      const playlist = await parseDocument(id, document, runtime.connection.headers);
      const previousCache = await loadM3uCache(id);
      await storeM3uCache(id, document);
      const refreshed = createProfile(
        id,
        profile.name,
        profile.locationType,
        runtime.connection.location,
        playlist,
        runtime.connection.epgUrl,
        profile.refreshIntervalMinutes,
        document.fileName,
        false,
        profile.editorRefreshPolicy || 'preserve-edits',
        profile.editorWriteBack === true,
      );
      const profiles = get().profiles.map((candidate) =>
        candidate.id === id ? refreshed : candidate,
      );
      try {
        writeProfiles(profiles);
      } catch (error) {
        if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
        else await deleteM3uCache(id).catch(() => undefined);
        throw error;
      }
      set((state) => ({
        profiles,
        runtimes: {
          ...state.runtimes,
          [id]: {
            connection: runtime.connection,
            playlist,
            baseUrl: document.baseUrl || undefined,
            status: 'ready',
            error: null,
            revision: (state.runtimes[id]?.revision ?? 0) + 1,
          },
        },
      }));
      void invalidateSourceQueries();
    } catch (error: unknown) {
      set((state) => ({
        runtimes: {
          ...state.runtimes,
          [id]: {
            ...runtime,
            status: runtime.playlist ? 'ready' : 'error',
            error: errorMessage(error),
          },
        },
      }));
      throw error;
    }
  },

  refreshStaleSources: async () => {
    const now = Date.now();
    const stale = get().profiles.filter(
      (profile) =>
        profile.locationType === 'remote' &&
        now - profile.lastRefreshAt >= profile.refreshIntervalMinutes * 60_000,
    );
    await Promise.allSettled(stale.map((profile) => get().refreshSource(profile.id)));
  },

  removeSource: async (id) => {
    const previousProfiles = get().profiles;
    const previousEnabledSourceIds = get().enabledSourceIds;
    const previousConnection = get().runtimes[id]?.connection ?? (await loadM3uConnection(id));
    const previousCache = await loadM3uCache(id);
    const profiles = get().profiles.filter((profile) => profile.id !== id);
    const enabledSourceIds = get().enabledSourceIds.filter((candidate) => candidate !== id);
    try {
      await Promise.all([deleteM3uConnection(id), deleteM3uCache(id)]);
      writeProfiles(profiles);
      writeEnabledSourceIds(enabledSourceIds);
    } catch (error) {
      if (previousConnection)
        await storeM3uConnection(id, previousConnection).catch(() => undefined);
      if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
      try {
        writeProfiles(previousProfiles);
      } catch {
        /* best-effort local rollback */
      }
      try {
        writeEnabledSourceIds(previousEnabledSourceIds);
      } catch {
        /* best-effort local rollback */
      }
      throw error;
    }
    set((state) => {
      const runtimes = { ...state.runtimes };
      delete runtimes[id];
      return { profiles, runtimes, enabledSourceIds };
    });
    await Promise.allSettled([deleteM3uDraft(id), clearM3uVersions(id)]);
    void invalidateSourceQueries();
  },
}));
