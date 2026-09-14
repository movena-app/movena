// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchStore } from '@/modules/search/store/useSearchStore';

beforeEach(() => {
  localStorage.clear();
  useSearchStore.setState({ recentSearches: [] });
});

describe('recent search store', () => {
  it('trims, case-insensitively deduplicates, and promotes recent queries', () => {
    const store = useSearchStore.getState();
    store.addRecentSearch('  Dune  ');
    store.addRecentSearch('Alien');
    store.addRecentSearch('dune');

    expect(useSearchStore.getState().recentSearches).toEqual(['dune', 'Alien']);
  });

  it('caps history and removes entries case-insensitively', () => {
    for (let index = 0; index < 18; index += 1) {
      useSearchStore.getState().addRecentSearch(`Query ${index}`);
    }
    expect(useSearchStore.getState().recentSearches).toHaveLength(15);

    useSearchStore.getState().removeRecentSearch('QUERY 17');
    expect(useSearchStore.getState().recentSearches).not.toContain('Query 17');
  });

  it('ignores blank input and can clear the list', () => {
    useSearchStore.getState().addRecentSearch('   ');
    expect(useSearchStore.getState().recentSearches).toEqual([]);
    useSearchStore.getState().addRecentSearch('Dune');
    useSearchStore.getState().clearRecentSearches();
    expect(useSearchStore.getState().recentSearches).toEqual([]);
  });
});
