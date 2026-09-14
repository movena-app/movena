/** Minimal shape of an Xtream Codes series episode, as returned by getSeriesInfo. */
interface SeriesEpisode {
  id: string | number;
  episode_num: string | number;
  title?: string | undefined;
  container_extension?: string | undefined;
  info?: { movie_image?: string | undefined } | undefined;
  stream_url?: string | undefined;
  http_headers?: Record<string, string> | undefined;
  source_id?: string | undefined;
}

export type SeriesEpisodesBySeason = Record<string, SeriesEpisode[]>;

export interface NextEpisodeResult {
  episode: SeriesEpisode;
  seasonNum: string;
}

/**
 * Finds the episode that follows `currentEpisodeId` within `currentSeasonNum`
 * — the next one in the same season, or episode 1 of the next season if the
 * current episode was the season's last. Returns null at the end of the
 * series, or if the current episode isn't in the list at all.
 */
export function findNextEpisode(
  episodesBySeason: SeriesEpisodesBySeason | undefined,
  currentEpisodeId: string | number,
  currentSeasonNum: string | number | undefined,
): NextEpisodeResult | null {
  if (!episodesBySeason) return null;

  const seasonsList = Object.keys(episodesBySeason);
  const currentSeason = currentSeasonNum?.toString() || seasonsList[0];
  if (!currentSeason) return null;
  const episodeList = episodesBySeason[currentSeason] || [];

  const currentIndex = episodeList.findIndex(
    (e) => e.id.toString() === currentEpisodeId.toString(),
  );

  if (currentIndex !== -1 && currentIndex + 1 < episodeList.length) {
    return { episode: episodeList[currentIndex + 1]!, seasonNum: currentSeason };
  }

  const seasonIndex = seasonsList.indexOf(currentSeason);
  if (seasonIndex !== -1 && seasonIndex + 1 < seasonsList.length) {
    const nextSeason = seasonsList[seasonIndex + 1];
    if (!nextSeason) return null;
    const nextSeasonEpisodes = episodesBySeason[nextSeason] || [];
    if (nextSeasonEpisodes.length > 0) {
      return { episode: nextSeasonEpisodes[0]!, seasonNum: nextSeason };
    }
  }

  return null;
}
