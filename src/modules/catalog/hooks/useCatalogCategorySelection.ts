import { useCallback } from 'react';
import {
  useSettingsStore,
  type CatalogType,
} from '@/modules/settings/public/store/useSettingsStore';

/**
 * Keeps the active category outside route components so leaving a catalogue
 * page and returning does not silently reset the user's browsing context.
 */
export function useCatalogCategorySelection(type: CatalogType) {
  const activeCategoryId = useSettingsStore((state) => state.selectedCategoryIds[type]);
  const setSelectedCategory = useSettingsStore((state) => state.setSelectedCategory);
  const selectCategory = useCallback(
    (id: string | null) => setSelectedCategory(type, id),
    [setSelectedCategory, type],
  );

  return [activeCategoryId, selectCategory] as const;
}
