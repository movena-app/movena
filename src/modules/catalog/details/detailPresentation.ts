interface DetailCredits {
  cast: Array<{ name: string }>;
  crew: Array<{ name: string; job: string | null; jobs: string[] }>;
}

interface EnrichedDetail {
  releaseYear: number | null;
  credits: DetailCredits;
  genres: Array<{ name: string }>;
}

interface DetailPresentationInput {
  enriched: EnrichedDetail | null | undefined;
  providerReleaseDate?: string | undefined;
  providerCast?: string | undefined;
  providerDirector?: string | undefined;
  providerGenres?: string | undefined;
}

export function buildDetailPresentation(input: DetailPresentationInput) {
  const providerReleaseYear = input.providerReleaseDate
    ? new Date(input.providerReleaseDate).getFullYear()
    : NaN;
  const tmdbCast = input.enriched?.credits.cast.map((credit) => credit.name).filter(Boolean) ?? [];
  const providerCast = input.providerCast?.split(/\s*,\s*/).filter(Boolean) ?? [];
  const director =
    input.enriched?.credits.crew.find(
      (credit) => credit.job === 'Director' || credit.jobs.includes('Director'),
    )?.name || input.providerDirector;
  const genres =
    input.enriched?.genres
      .map((genre) => genre.name)
      .filter(Boolean)
      .join(' / ') || input.providerGenres?.replace(/\s*,\s*/g, ' / ');

  return {
    releaseYear: input.enriched?.releaseYear ?? providerReleaseYear,
    castList: tmdbCast.length > 0 ? tmdbCast : providerCast,
    director,
    genres,
  };
}
