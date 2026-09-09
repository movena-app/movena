export interface MediaItem {
  id: string;
  title: string;
  year?: string | undefined;
  posterUrl: string;
  type?: 'live' | 'vod' | 'series' | undefined;
  quality?: string | undefined;
  tags?: string[] | undefined;
  country?: string | null | undefined;
  rating?: number | undefined;
  progress?: number | undefined;
  progressPercentage?: number | undefined;
  isFavorite?: boolean | undefined;
  isWatched?: boolean | undefined;
  subtitle?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
  channelNum?: string | number | undefined;
  seriesId?: string | undefined;
  seriesSourceItemId?: string | undefined;
  seriesTitle?: string | undefined;
  seriesPosterUrl?: string | undefined;
  episodeTitle?: string | undefined;
  streamUrl?: string | undefined;
  httpHeaders?: Record<string, string> | undefined;
  sourceId?: string | undefined;
  sourceItemId?: string | undefined;
  epgChannelId?: string | undefined;
  categoryId?: string | undefined;
  genre?: string | undefined;
  genres?: string[] | undefined;
  description?: string | undefined;
  containerExtension?: string | undefined;
  added?: string | undefined;
  radio?: boolean | undefined;
  radioMetadata?:
    | {
        title: string;
        artist?: string | undefined;
        album?: string | undefined;
        genre?: string | undefined;
        channelNumber?: string | undefined;
        logoUrl?: string | undefined;
      }
    | undefined;
  catchup?: string | undefined;
  catchupSource?: string | undefined;
  catchupDays?: number | undefined;
  fallbacks?:
    Array<{ streamUrl: string; httpHeaders?: Record<string, string> | undefined }> | undefined;
}

/** Ephemeral navigation context used when a series is opened from an episode. */
export interface MediaOpenContext {
  seasonNumber?: number | undefined;
  episodeNumber?: number | undefined;
}
