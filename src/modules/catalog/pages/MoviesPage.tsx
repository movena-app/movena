import { useCallback } from 'react';
import { Film } from 'lucide-react';
import type { MediaItem } from '../model/media';
import { CatalogPage } from '../components/CatalogPage';
import { MediaDetailsDialogs } from '../details/MediaDetailsDialogs';
import { useMediaDetailState } from '../hooks/useMediaDetailsState';

export function MoviesPage() {
  const { selectedMovie, setSelectedMovie, handleCloseMovie } = useMediaDetailState();

  const handleItemClick = useCallback(
    (item: MediaItem) => {
      setSelectedMovie(item);
    },
    [setSelectedMovie],
  );

  return (
    <>
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movie titles available in this category."
        noSourceDescription="Connect an Xtream account or add an M3U playlist in Settings to view movies."
        onItemClick={handleItemClick}
      />

      <MediaDetailsDialogs selectedMovie={selectedMovie} onCloseMovie={handleCloseMovie} />
    </>
  );
}
