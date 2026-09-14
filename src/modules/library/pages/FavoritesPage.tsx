import { VirtualizedGrid } from '@/modules/catalog/public/components/VirtualizedGrid';
import { useLibraryStore } from '../store/useLibraryStore';
import { CatalogViewToggle } from '@/modules/catalog/public/components/CatalogViewToggle';
import { Heart } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HeaderSearch } from '@/modules/search/public/components/HeaderSearch';
import styles from '@/app/shell/AppLayout.module.css';
import { CatalogPageHeader } from '@/modules/catalog/public/components/CatalogPageHeader';
import { MediaDetailsDialogs } from '@/modules/catalog/public/details/MediaDetailsDialogs';
import { useMediaDetailState } from '@/modules/catalog/public/hooks/useMediaDetailsState';
import { useI18n } from '@/shared/i18n/i18n';

export function FavoritesPage() {
  const { tn, number } = useI18n();
  const favorites = useLibraryStore((state) => state.favorites);

  const { selectedMovie, selectedSeries, handleCloseMovie, handleCloseSeries, handleItemClick } =
    useMediaDetailState({ enableSourceOnOpen: true });

  return (
    <>
      <div className={styles.page}>
        <CatalogPageHeader
          title="Favorites"
          meta={tn(
            'Your personal library · {count} item',
            'Your personal library · {count} items',
            favorites.length,
            { count: number(favorites.length) },
          )}
          actions={
            <>
              <HeaderSearch onItemClick={handleItemClick} />
              <CatalogViewToggle />
            </>
          }
        />

        {favorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Your Favorites Are Empty"
            description="Save movies, series, or live channels to your personal library for quick access anytime."
          />
        ) : (
          <div className={styles.catalogContent}>
            <VirtualizedGrid items={favorites} onItemClick={handleItemClick} />
          </div>
        )}
      </div>

      <MediaDetailsDialogs
        selectedMovie={selectedMovie}
        selectedSeries={selectedSeries}
        onCloseMovie={handleCloseMovie}
        onCloseSeries={handleCloseSeries}
      />
    </>
  );
}
