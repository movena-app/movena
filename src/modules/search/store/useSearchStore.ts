import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';

interface SearchState {
  recentSearches: string[];
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      recentSearches: [],

      addRecentSearch: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 1) return;

        const current = get().recentSearches;
        // Case-insensitive filter out existing query to place new one at top
        const filtered = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());

        // Keep max 15 recent searches
        const updated = [trimmed, ...filtered].slice(0, 15);
        set({ recentSearches: updated });
        debugLog.info('search', `Added recent search: "${trimmed}"`);
      },

      removeRecentSearch: (query: string) => {
        set((state) => ({
          recentSearches: state.recentSearches.filter(
            (item) => item.toLowerCase() !== query.toLowerCase(),
          ),
        }));
        debugLog.info('search', `Removed recent search: "${query}"`);
      },

      clearRecentSearches: () => {
        set({ recentSearches: [] });
        debugLog.info('search', 'Cleared all recent searches');
      },
    }),
    {
      name: 'iptv-search-storage',
      version: 1,
      migrate: (persistedState: unknown) => {
        const state = (
          persistedState && typeof persistedState === 'object' ? persistedState : {}
        ) as Partial<SearchState>;
        return {
          recentSearches: Array.isArray(state.recentSearches) ? state.recentSearches : [],
        } as SearchState;
      },
    },
  ),
);
