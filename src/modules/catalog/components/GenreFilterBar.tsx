import { useMemo } from 'react';
import type { SmartCatalogItem } from '../lib/smartCatalogFilter';
import { getAvailableGenres } from '../lib/smartCatalogFilter';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './GenreFilterBar.module.css';

interface GenreFilterBarProps<T extends SmartCatalogItem> {
  items: T[];
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
  categoryNameMap?: Map<string, string> | undefined;
  className?: string | undefined;
}

export function GenreFilterBar<T extends SmartCatalogItem>({
  items,
  selectedGenre,
  onSelectGenre,
  categoryNameMap,
  className,
}: GenreFilterBarProps<T>) {
  const { t, number } = useI18n();

  const availableGenres = useMemo(() => {
    return getAvailableGenres(items, categoryNameMap);
  }, [items, categoryNameMap]);

  if (availableGenres.length === 0) {
    return null;
  }

  const isAllSelected = selectedGenre === null || selectedGenre === 'All';

  return (
    <div
      className={`${styles.container} ${className || ''}`}
      role="group"
      aria-label={t('Filter by genre')}
    >
      <button
        type="button"
        className={`${styles.chip} ${isAllSelected ? styles.activeChip : ''}`}
        onClick={() => onSelectGenre(null)}
        aria-pressed={isAllSelected}
      >
        <span>{t('All Genres')}</span>
        <span className={styles.chipCount}>{number(items.length)}</span>
      </button>

      {availableGenres.map(({ genre, count }) => {
        const isSelected = selectedGenre === genre;
        return (
          <button
            key={genre}
            type="button"
            className={`${styles.chip} ${isSelected ? styles.activeChip : ''}`}
            onClick={() => onSelectGenre(isSelected ? null : genre)}
            aria-pressed={isSelected}
          >
            <span>{t(genre)}</span>
            <span className={styles.chipCount}>{number(count)}</span>
          </button>
        );
      })}
    </div>
  );
}
