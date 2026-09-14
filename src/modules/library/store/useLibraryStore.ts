import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

/**
 * Debounced localStorage wrapper for Zustand persist.
 *
 * During video playback the watch-progress hook updates the library store
 * every 3 seconds. Without debouncing, each update triggers a synchronous
 * `sanitizedLibraryData` → `JSON.stringify` → `localStorage.setItem` cycle
 * on the entire library state, causing frame drops on large histories.
 *
 * This wrapper coalesces writes so at most one flush happens per
 * `DEBOUNCE_MS` window, while reads remain immediate.
 */
const PERSIST_DEBOUNCE_MS = 5000;
const MAX_HISTORY_ITEMS = 200;

function createDebouncedStorage<T>(): PersistStorage<T> {
  let pendingValue: string | null = null;
  let pendingKey: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingKey !== null && pendingValue !== null) {
      try {
        localStorage.setItem(pendingKey, pendingValue);
      } catch {
        // Storage full — silently drop. The next successful write will
        // persist the latest state.
      }
    }
    pendingKey = null;
    pendingValue = null;
    timer = null;
  }

  // Ensure pending data is flushed on page unload (tab close, refresh).
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
  }

  return {
    getItem(name) {
      const raw = localStorage.getItem(name);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state: T; version?: number | undefined };
        return {
          state: parsed.state,
          ...(parsed.version !== undefined ? { version: parsed.version } : {}),
        };
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      pendingKey = name;
      pendingValue = JSON.stringify(value);
      if (timer === null) {
        timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
      }
    },
    removeItem(name) {
      // Cancel any pending write for this key.
      if (pendingKey === name) {
        pendingKey = null;
        pendingValue = null;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      }
      localStorage.removeItem(name);
    },
  };
}
import type { MediaItem } from '@/modules/catalog/public/model/media';
import { getDisplayTitle } from '@/modules/catalog/public/lib/titleParser';

export interface HistoryItem extends MediaItem {
  progressPercentage: number;
  lastWatchedAt: number;
  currentTime?: number | undefined;
  duration?: number | undefined;
  seriesId?: string | undefined;
  seriesSourceItemId?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
  episodeId?: string | undefined;
  episodeTitle?: string | undefined;
}

/** A playback position reported by the player. */
export interface WatchProgress {
  /** The thing being played: a movie id, or an episode id for series. */
  id: string;
  seriesId?: string | undefined;
  title: string;
  posterUrl: string;
  type: 'vod' | 'series';
  currentTime: number;
  duration: number;
  tags?: string[] | undefined;
  country?: string | null | undefined;
  streamUrl?: string | undefined;
  httpHeaders?: Record<string, string> | undefined;
  sourceId?: string | undefined;
  sourceItemId?: string | undefined;
  seriesSourceItemId?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
  episodeTitle?: string | undefined;
  /**
   * The episode after this one, if the caller already knows it (the player
   * has the series' episode list loaded while something is playing). When
   * this episode turns out to be finished, Continue Watching advances to
   * this instead of just dropping the show.
   */
  nextEpisode?:
    | {
        id: string;
        seasonNum: string | number;
        episodeNum: string | number;
        episodeTitle?: string | undefined;
        streamUrl?: string | undefined;
        httpHeaders?: Record<string, string> | undefined;
        sourceId?: string | undefined;
      }
    | undefined;
}

/**
 * Below this, there is nothing worth resuming — someone opened the wrong thing
 * or watched the studio logo. Deliberately in seconds: the previous rule used
 * 2% of the runtime, which is nearly two and a half minutes into a two hour
 * film, so short sessions vanished without a trace.
 */
const MIN_RESUMABLE_SECONDS = 20;

/** Within this much of the end, treat it as finished rather than resumable. */
const FINISHED_TAIL_SECONDS = 120;

interface Collection {
  id: string;
  name: string;
  items: MediaItem[];
}

interface LibraryState {
  favorites: MediaItem[];
  collections: Collection[];
  history: HistoryItem[];
  watched: string[];

  addFavorite: (item: MediaItem) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  toggleWatched: (id: string) => void;
  isWatched: (id: string) => boolean;

  createCollection: (name: string) => void;
  renameCollection: (id: string, newName: string) => void;
  deleteCollection: (id: string) => void;
  addToCollection: (collectionId: string, item: MediaItem) => void;
  removeFromCollection: (collectionId: string, itemId: string) => void;

  updateHistory: (progress: WatchProgress) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
  clearFavorites: () => void;
  clearCollections: () => void;
  clearAllData: () => void;
}

function withoutPlaybackTransport<T extends MediaItem>(item: T): T {
  const safe: MediaItem = { ...item };
  delete safe.streamUrl;
  delete safe.httpHeaders;
  return safe as T;
}

function sanitizedLibraryData(
  state: Pick<LibraryState, 'favorites' | 'collections' | 'history' | 'watched'>,
) {
  return {
    favorites: state.favorites.map(withoutPlaybackTransport),
    collections: state.collections.map((collection) => ({
      ...collection,
      items: collection.items.map(withoutPlaybackTransport),
    })),
    history: state.history.map(withoutPlaybackTransport),
    watched: state.watched,
  };
}

export function migrateLibraryState(persistedState: unknown): LibraryState {
  const state = (
    persistedState && typeof persistedState === 'object' ? persistedState : {}
  ) as Partial<LibraryState> & { downloads?: unknown | undefined };
  const nextState = { ...state };
  delete nextState.downloads;

  const normalized = {
    ...nextState,
    favorites: Array.isArray(state.favorites) ? state.favorites : [],
    collections: Array.isArray(state.collections) ? state.collections : [],
    history: Array.isArray(state.history) ? state.history : [],
    watched: Array.isArray(state.watched) ? state.watched : [],
  } as LibraryState;
  return { ...normalized, ...sanitizedLibraryData(normalized) };
}

import { notify } from '@/shared/notifications/useNotificationStore';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      collections: [],
      history: [],
      watched: [],

      addFavorite: (item) => {
        const exists = get().favorites.some((f) => f.id === item.id);
        if (!exists) {
          set((state) => ({ favorites: [...state.favorites, item] }));
          notify.success(
            'Added to Favorites',
            getDisplayTitle(item.title, item.type),
            undefined,
            undefined,
            'library',
          );
          debugLog.info('library', `Added favorite: ${item.title}`, {
            id: item.id,
            type: item.type,
          });
        }
      },

      removeFavorite: (id) => {
        const item = get().favorites.find((f) => f.id === id);
        set((state) => ({ favorites: state.favorites.filter((f) => f.id !== id) }));
        notify.info(
          'Removed from Favorites',
          item ? getDisplayTitle(item.title, item.type) : 'Item removed',
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', `Removed favorite`, { id });
      },

      isFavorite: (id) => get().favorites.some((f) => f.id === id),

      toggleWatched: (id) => {
        const isCurrentlyWatched = (get().watched || []).includes(id);
        set((state) => ({
          watched: isCurrentlyWatched
            ? (state.watched || []).filter((wId) => wId !== id)
            : [...(state.watched || []), id],
        }));
        notify.info(
          isCurrentlyWatched ? 'Marked as Unwatched' : 'Marked as Watched',
          undefined,
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', `Toggled watched status`, { id, watched: !isCurrentlyWatched });
      },

      isWatched: (id) => (get().watched || []).includes(id),

      createCollection: (name) => {
        const newCol = { id: crypto.randomUUID(), name, items: [] };
        set((state) => ({ collections: [...state.collections, newCol] }));
        notify.success(
          'Collection Created',
          `Collection "${name}" ready.`,
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', `Created collection: ${name}`, { id: newCol.id });
      },

      renameCollection: (id, newName) => {
        const targetCol = get().collections.find((c) => c.id === id);
        if (targetCol) {
          set((state) => ({
            collections: state.collections.map((c) => (c.id === id ? { ...c, name: newName } : c)),
          }));
          notify.success(
            'Collection Renamed',
            `Renamed to "${newName}".`,
            undefined,
            undefined,
            'library',
          );
          debugLog.info('library', `Renamed collection`, { id, newName });
        }
      },

      deleteCollection: (id) => {
        const targetCol = get().collections.find((c) => c.id === id);
        set((state) => ({
          collections: state.collections.filter((c) => c.id !== id),
        }));
        notify.info(
          'Collection Deleted',
          targetCol ? `"${targetCol.name}" removed.` : 'Collection removed.',
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', `Deleted collection`, { id });
      },

      addToCollection: (collectionId, item) => {
        const targetCol = get().collections.find((c) => c.id === collectionId);
        if (targetCol && !targetCol.items.some((i) => i.id === item.id)) {
          set((state) => ({
            collections: state.collections.map((c) =>
              c.id === collectionId ? { ...c, items: [...c.items, item] } : c,
            ),
          }));
          notify.success(
            'Added to Collection',
            `"${getDisplayTitle(item.title, item.type)}" added to ${targetCol.name}`,
            undefined,
            undefined,
            'library',
          );
          debugLog.info('library', `Added item to collection`, { collectionId, itemId: item.id });
        }
      },

      removeFromCollection: (collectionId, itemId) => {
        const targetCol = get().collections.find((c) => c.id === collectionId);
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c,
          ),
        }));
        notify.info(
          'Removed from Collection',
          targetCol ? `Removed from ${targetCol.name}` : undefined,
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', `Removed item from collection`, { collectionId, itemId });
      },

      updateHistory: (progress) =>
        set((state) => {
          const { currentTime, duration } = progress;
          if (!(duration > 0) || !(currentTime > 0)) return state;

          // A series is tracked under its *series* id, not the episode's. Both
          // readers — the series modal and the in-player episode drawer — look the
          // entry up by series id, while this used to store it under the episode
          // id, so nothing ever matched and series never resumed. It also keeps
          // Continue Watching to one card per show instead of one per episode.
          const historyId =
            progress.type === 'series' ? (progress.seriesId ?? progress.id) : progress.id;

          const others = state.history.filter((h) => h.id !== historyId);
          const watched = state.watched || [];
          const remaining = duration - currentTime;

          // Finished: remember it as watched. Watched is recorded per episode,
          // so finishing one does not mark a whole series. For a series with a
          // next episode already known, Continue Watching advances to that
          // episode instead of just dropping the show — otherwise finishing
          // the episode you're watching removed all trace of the show from
          // Continue Watching, so there was nothing to click to keep going.
          if (remaining <= FINISHED_TAIL_SECONDS) {
            const nextWatched = watched.includes(progress.id) ? watched : [...watched, progress.id];

            if (progress.type === 'series' && progress.nextEpisode) {
              const next = progress.nextEpisode;
              const nextEntry: HistoryItem = {
                id: historyId,
                title: progress.title,
                // Series cover, not the next episode's still — same reasoning
                // as the currently-playing entry below: the card stands for
                // the whole show.
                posterUrl: progress.posterUrl,
                type: 'series',
                progressPercentage: 0,
                lastWatchedAt: Date.now(),
                currentTime: 0,
                duration: 0,
                seriesId: progress.seriesId,
                sourceItemId: progress.seriesSourceItemId,
                seriesSourceItemId: progress.seriesSourceItemId,
                seasonNum: next.seasonNum,
                episodeNum: next.episodeNum,
                episodeId: next.id,
                episodeTitle: next.episodeTitle,
                tags: progress.tags,
                country: progress.country,
                streamUrl: next.streamUrl,
                httpHeaders: next.httpHeaders,
                sourceId: next.sourceId || progress.sourceId,
              };
              return {
                history: [nextEntry, ...others].slice(0, MAX_HISTORY_ITEMS),
                watched: nextWatched,
              };
            }

            return { history: others, watched: nextWatched };
          }

          // Too early to be worth resuming. Leave any existing entry untouched
          // rather than overwriting a real position with a near-zero one.
          if (currentTime < MIN_RESUMABLE_SECONDS) return state;

          const entry: HistoryItem = {
            id: historyId,
            title: progress.title,
            posterUrl: progress.posterUrl,
            type: progress.type,
            progressPercentage: (currentTime / duration) * 100,
            lastWatchedAt: Date.now(),
            currentTime,
            duration,
            seriesId: progress.seriesId,
            sourceItemId:
              progress.type === 'series' ? progress.seriesSourceItemId : progress.sourceItemId,
            seriesSourceItemId: progress.seriesSourceItemId,
            seasonNum: progress.seasonNum,
            episodeNum: progress.episodeNum,
            episodeId:
              progress.type === 'series' ? (progress.sourceItemId ?? progress.id) : undefined,
            episodeTitle: progress.episodeTitle,
            tags: progress.tags,
            country: progress.country,
            streamUrl: progress.streamUrl,
            httpHeaders: progress.httpHeaders,
            sourceId: progress.sourceId,
          };

          return { history: [entry, ...others].slice(0, MAX_HISTORY_ITEMS) };
        }),

      removeFromHistory: (id) => {
        const item = get().history.find((h) => h.id === id);
        set((state) => ({
          history: state.history.filter((h) => h.id !== id),
        }));
        notify.info(
          'Removed from Watch History',
          item ? getDisplayTitle(item.title, item.type) : 'Item removed',
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', `Removed item from history`, { id });
      },

      clearHistory: () => {
        set({ history: [] });
        notify.info(
          'Watch History Cleared',
          'All watch history and progress removed.',
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', 'Cleared all watch history');
      },

      clearFavorites: () => {
        set({ favorites: [] });
        notify.info(
          'Favorites Cleared',
          'All saved favorites removed.',
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', 'Cleared all favorites');
      },

      clearCollections: () => {
        set({ collections: [] });
        notify.info(
          'Collections Cleared',
          'All user created collections removed.',
          undefined,
          undefined,
          'library',
        );
        debugLog.info('library', 'Cleared all collections');
      },

      clearAllData: () => {
        set({ favorites: [], collections: [], history: [], watched: [] });
        notify.warning(
          'Library Reset',
          'All history, favorites, collections, and watched state cleared.',
          undefined,
          undefined,
          'library',
        );
        debugLog.warn('library', 'Cleared all library data');
      },
    }),
    {
      name: 'iptv-library-storage',
      version: 3,
      migrate: migrateLibraryState,
      storage: createDebouncedStorage<LibraryState>(),
      partialize: (state) => ({ ...state, ...sanitizedLibraryData(state) }),
    },
  ),
);
