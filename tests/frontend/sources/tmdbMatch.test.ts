import { describe, expect, it } from 'vitest';
import { selectTmdbMatch, tmdbTitleKey } from '@/modules/metadata/model/tmdbMatch';

const candidate = (
  id: number,
  title: string,
  releaseYear: number | null,
  originalTitle?: string,
) => ({
  id,
  title,
  originalTitle: originalTitle ?? null,
  releaseYear,
});

describe('TMDB title matching', () => {
  it('normalizes case, accents and punctuation', () => {
    expect(tmdbTitleKey('Amélie: Le Fabuleux Destin')).toBe('amelielefabuleuxdestin');
    expect(tmdbTitleKey('Spider-Man')).toBe(tmdbTitleKey('spider man'));
    expect(tmdbTitleKey('Fast & Furious')).toBe('fastandfurious');
    expect(tmdbTitleKey('  ')).toBe('');
  });

  it('prefers the exact title over TMDB result order', () => {
    const match = selectTmdbMatch({ title: 'City of Blood' }, [
      candidate(1, 'City of Bloodlines', 2021),
      candidate(2, 'City of Blood', 2021),
    ]);
    expect(match?.id).toBe(2);
  });

  it('matches the original title and near-identical spellings', () => {
    const intouchables = [candidate(7, 'The Intouchables', 2011, 'Intouchables')];
    expect(selectTmdbMatch({ title: 'Intouchables' }, intouchables)?.id).toBe(7);
    expect(selectTmdbMatch({ title: 'Les Intouchables' }, intouchables)?.id).toBe(7);
    expect(
      selectTmdbMatch({ title: 'City of Bloods', year: 2023 }, [
        candidate(3, 'City of Blood', 2023),
      ])?.id,
    ).toBe(3);
  });

  it('never takes a different title that merely shares words', () => {
    expect(
      selectTmdbMatch({ title: 'Avatar' }, [candidate(1, 'Avatar: The Way of Water', 2022)]),
    ).toBeUndefined();
    expect(selectTmdbMatch({ title: 'Saw' }, [candidate(1, 'Saw II', 2005)])).toBeUndefined();
    expect(
      selectTmdbMatch({ title: 'City of Bloods' }, [candidate(1, 'Blood City', 2023)]),
    ).toBeUndefined();
  });

  it('tells namesakes apart by year and tolerates one year of drift', () => {
    const dunes = [candidate(1, 'Dune', 1984), candidate(2, 'Dune', 2021)];
    expect(selectTmdbMatch({ title: 'Dune', year: 2021 }, dunes)?.id).toBe(2);
    expect(selectTmdbMatch({ title: 'Dune', year: 2022 }, dunes)?.id).toBe(2);
    expect(selectTmdbMatch({ title: 'Dune', year: 2000 }, dunes)).toBeUndefined();
    // Without a year TMDB's order decides between identical titles.
    expect(selectTmdbMatch({ title: 'Dune' }, dunes)?.id).toBe(1);
    // A candidate TMDB has no date for cannot contradict the year.
    expect(selectTmdbMatch({ title: 'Dune', year: 2030 }, [candidate(9, 'Dune', null)])?.id).toBe(
      9,
    );
  });

  it('returns nothing for an empty title or no candidates', () => {
    expect(selectTmdbMatch({ title: '  ' }, [candidate(1, 'Anything', 2020)])).toBeUndefined();
    expect(selectTmdbMatch({ title: 'Dune', year: 2021 }, [])).toBeUndefined();
  });
});
