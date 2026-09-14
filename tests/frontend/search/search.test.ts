import { describe, expect, it } from 'vitest';
import {
  calculateMatchScore,
  getTokens,
  levenshteinDistance,
  normalizeText,
  smartSearch,
  toCompact,
} from '@/modules/search/lib/search';

const items = [
  {
    id: '1',
    title: 'Spider-Man: No Way Home',
    posterUrl: '',
    type: 'vod' as const,
    year: '2021',
    quality: '4K',
  },
  { id: '2', title: 'Spider-Man', posterUrl: '', type: 'vod' as const, year: '2002' },
  { id: '3', title: 'The Amazing Spider-Man', posterUrl: '', type: 'vod' as const, year: '2012' },
];

describe('search normalization and ranking', () => {
  it('normalizes accents and punctuation consistently', () => {
    expect(normalizeText('Café München')).toBe('cafe munchen');
    expect(getTokens('Spider-Man: No Way Home')).toEqual(['spider', 'man', 'no', 'way', 'home']);
    expect(toCompact('Spider-Man: No Way Home')).toBe('spidermannowayhome');
  });

  it('calculates edit distance for substitutions, insertions, and empty input', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('', 'movie')).toBe(5);
    expect(levenshteinDistance('same', 'same')).toBe(0);
  });

  it('ranks exact and prefix matches ahead of partial matches', () => {
    expect(smartSearch(items, 'spider-man').map((item) => item.id)).toEqual(['2', '1', '3']);
  });

  it('tolerates small typos and uses metadata as a ranking signal', () => {
    expect(calculateMatchScore(items[0]!, 'spidr 2021 4k')).toBeGreaterThan(0);
    expect(smartSearch(items, '2021 4k').map((item) => item.id)).toEqual(['1']);
  });

  it('returns no results for whitespace or unrelated queries', () => {
    expect(smartSearch(items, '   ')).toEqual([]);
    expect(smartSearch(items, 'documentary')).toEqual([]);
  });
});
