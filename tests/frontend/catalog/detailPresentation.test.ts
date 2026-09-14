import { describe, expect, it } from 'vitest';
import { buildDetailPresentation } from '@/modules/catalog/details/detailPresentation';

describe('shared detail presentation', () => {
  it('prefers normalized metadata and identifies directors across aggregated jobs', () => {
    expect(
      buildDetailPresentation({
        enriched: {
          releaseYear: 2025,
          credits: {
            cast: [{ name: 'Lead' }, { name: 'Support' }],
            crew: [{ name: 'Director', job: null, jobs: ['Writer', 'Director'] }],
          },
          genres: [{ name: 'Drama' }, { name: 'Mystery' }],
        },
        providerReleaseDate: '2020-02-03',
        providerCast: 'Fallback One, Fallback Two',
        providerDirector: 'Fallback Director',
        providerGenres: 'Fallback, Genre',
      }),
    ).toEqual({
      releaseYear: 2025,
      castList: ['Lead', 'Support'],
      director: 'Director',
      genres: 'Drama / Mystery',
    });
  });

  it('normalizes provider-only presentation data', () => {
    expect(
      buildDetailPresentation({
        enriched: null,
        providerReleaseDate: '2021-11-10',
        providerCast: 'One, Two',
        providerDirector: 'Someone',
        providerGenres: 'Comedy, Family',
      }),
    ).toEqual({
      releaseYear: 2021,
      castList: ['One', 'Two'],
      director: 'Someone',
      genres: 'Comedy / Family',
    });
  });
});
