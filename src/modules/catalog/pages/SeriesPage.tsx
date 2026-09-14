import { useCallback } from 'react';
import { MonitorPlay } from 'lucide-react';
import type { MediaItem } from '../model/media';
import { CatalogPage } from '../components/CatalogPage';
import { MediaDetailsDialogs } from '../details/MediaDetailsDialogs';
import { useMediaDetailState } from '../hooks/useMediaDetailsState';

export function SeriesPage() {
  const { selectedSeries, setSelectedSeries, handleCloseSeries } = useMediaDetailState();

  const handleItemClick = useCallback(
    (item: MediaItem) => {
      setSelectedSeries(item);
    },
    [setSelectedSeries],
  );

  return (
    <>
      <CatalogPage
        type="series"
        title="Series"
        icon={MonitorPlay}
        emptyTitle="No Series Found"
        emptyDescription="There are no TV series available in this category."
        noSourceDescription="Connect an Xtream account or add an M3U playlist in Settings to view TV series."
        onItemClick={handleItemClick}
      />

      <MediaDetailsDialogs selectedSeries={selectedSeries} onCloseSeries={handleCloseSeries} />
    </>
  );
}
