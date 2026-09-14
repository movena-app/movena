import { beforeEach, describe, expect, it } from 'vitest';
import { countHiddenCategories, isCategoryHidden } from '@/modules/catalog/lib/categorySidebar';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const rows = [
  { id: 'movies', country: 'DE' },
  { id: 'kids', country: 'DE' },
  { id: 'international', country: null },
];

describe('category sidebar visibility', () => {
  it('does not double-count a category hidden both directly and by country', () => {
    const hidden = new Set(['movies']);
    const hiddenCountries = new Set(['DE']);

    expect(isCategoryHidden(rows[0]!, hidden, hiddenCountries)).toBe(true);
    expect(countHiddenCategories(rows, hidden, hiddenCountries)).toBe(2);
  });
});

describe('category preference actions', () => {
  beforeEach(() => {
    useSettingsStore.getState().setCollapsedCategories('vod', []);
  });

  it('replaces and deduplicates collapsed groups through the store API', () => {
    useSettingsStore.getState().setCollapsedCategories('vod', ['DE', 'GB', 'DE']);
    expect(useSettingsStore.getState().categoryPrefs.collapsed.vod).toEqual(['DE', 'GB']);
  });
});
