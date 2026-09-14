import { lazy, Suspense } from 'react';
import type { MediaItem } from '../model/media';

const MovieDetailsDialog = lazy(() =>
  import('./MovieDetailsDialog').then((module) => ({ default: module.MovieDetailsDialog })),
);
const SeriesDetailsDialog = lazy(() =>
  import('./SeriesDetailsDialog').then((module) => ({ default: module.SeriesDetailsDialog })),
);

function positiveNumber(value: string | number | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export interface MediaDetailsDialogsProps {
  selectedMovie?: MediaItem | null | undefined;
  selectedSeries?: MediaItem | null | undefined;
  onCloseMovie?: (() => void) | undefined;
  onCloseSeries?: (() => void) | undefined;
  onCloseAll?: (() => void) | undefined;
}

export function MediaDetailsDialogs({
  selectedMovie,
  selectedSeries,
  onCloseMovie,
  onCloseSeries,
  onCloseAll,
}: MediaDetailsDialogsProps) {
  const closeMovie = onCloseMovie || onCloseAll || (() => {});
  const closeSeries = onCloseSeries || onCloseAll || (() => {});

  return (
    <>
      {selectedMovie && (
        <Suspense fallback={null}>
          <MovieDetailsDialog
            movieId={selectedMovie.id}
            movieTitle={selectedMovie.title}
            moviePoster={selectedMovie.posterUrl}
            sourceId={selectedMovie.sourceId}
            sourceItemId={selectedMovie.sourceItemId}
            onClose={closeMovie}
          />
        </Suspense>
      )}

      {selectedSeries && (
        <Suspense fallback={null}>
          <SeriesDetailsDialog
            seriesId={selectedSeries.id}
            seriesTitle={selectedSeries.title}
            seriesPoster={selectedSeries.posterUrl}
            sourceId={selectedSeries.sourceId}
            sourceItemId={selectedSeries.sourceItemId}
            initialSeasonNumber={positiveNumber(selectedSeries.seasonNum)}
            initialEpisodeNumber={positiveNumber(selectedSeries.episodeNum)}
            onClose={closeSeries}
          />
        </Suspense>
      )}
    </>
  );
}
