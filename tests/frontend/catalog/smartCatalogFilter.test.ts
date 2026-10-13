import { describe, expect, it } from 'vitest';
import {
  effectiveItemRating,
  filterItemsBySmartCategory,
  filterItemsByGenre,
  getAvailableGenres,
  itemHasKnownGenre,
  itemMatchesGenre,
  sortCatalogItems,
  type RatingLookups,
} from '@/modules/catalog/lib/smartCatalogFilter';

const items = [
  { id: '1', title: 'Sky Sport UHD', posterUrl: '', type: 'live' as const, categoryId: '10' },
  { id: '2', title: 'BBC News', posterUrl: '', type: 'live' as const, categoryId: '20' },
  { id: '3', title: 'Disney Junior', posterUrl: '', type: 'live' as const, categoryId: '30' },
  { id: '4', title: 'Uncategorised', posterUrl: '', type: 'live' as const },
];

const categories = [
  { category_id: 10, category_name: 'DE | Sports &amp; UHD' },
  { category_id: 20, category_name: 'UK | News' },
  { category_id: 30, category_name: 'DE | Kids' },
];

describe('smart catalogue filtering', () => {
  it('keeps uncategorized items while removing hidden categories from All', () => {
    expect(filterItemsBySmartCategory(items, null, new Set(['20'])).map((item) => item.id)).toEqual(
      ['1', '3', '4'],
    );
  });

  it('builds country groups from decoded provider category names', () => {
    expect(
      filterItemsBySmartCategory(items, 'country:DE', new Set(['30']), [], categories).map(
        (item) => item.id,
      ),
    ).toEqual(['1']);
  });

  it('matches favorites and built-in smart categories', () => {
    expect(
      filterItemsBySmartCategory(items, 'smart:favorites', new Set(), [{ id: '2' }]).map(
        (item) => item.id,
      ),
    ).toEqual(['2']);
    expect(filterItemsBySmartCategory(items, 'smart:4k', new Set()).map((item) => item.id)).toEqual(
      ['1'],
    );
    expect(
      filterItemsBySmartCategory(items, 'smart:news', new Set()).map((item) => item.id),
    ).toEqual(['2']);
    expect(
      filterItemsBySmartCategory(items, 'smart:kids', new Set()).map((item) => item.id),
    ).toEqual(['3']);
  });

  it('lets a verified resolution override the smart:4k match instead of trusting the title', () => {
    // "Sky Sport UHD" claims 4K in its own name, but the actually-decoded
    // stream measured out as FHD — the verified truth wins, so it drops out.
    expect(
      filterItemsBySmartCategory(items, 'smart:4k', new Set(), [], [], new Map([['1', 'FHD']])).map(
        (item) => item.id,
      ),
    ).toEqual([]);

    // The reverse also holds: a channel with no 4K wording in its name still
    // belongs in the smart:4k group once verified as actually being 4K —
    // alongside "Sky Sport UHD", which still matches on its own title here.
    expect(
      filterItemsBySmartCategory(items, 'smart:4k', new Set(), [], [], new Map([['2', '4K']])).map(
        (item) => item.id,
      ),
    ).toEqual(['1', '2']);
  });

  it('falls back to exact provider category matching', () => {
    expect(filterItemsBySmartCategory(items, '20', new Set()).map((item) => item.id)).toEqual([
      '2',
    ]);
  });

  it('matches all sibling categories sharing the same parsed country, label, and tags', () => {
    const mergedCats = [
      { category_id: 101, category_name: 'AL| Sport ᴳᴼᴸᴰ ᴿᴬᵂ' },
      { category_id: 102, category_name: 'AL| Sport' },
      { category_id: 103, category_name: 'AL| Sport ⱽᴵᴾ ᴿᴬᵂ' },
      { category_id: 201, category_name: 'AL| ᴳᴼᴸᴰ ᴿᴬᵂ' },
      { category_id: 202, category_name: 'AL| ᴾᴿᴱᴹᴵᵁᴹ ᴿᴬᵂ' },
    ];
    const streamItems = [
      { id: 's1', title: 'Sport 1', posterUrl: '', type: 'live' as const, categoryId: '101' },
      { id: 's2', title: 'Sport 2', posterUrl: '', type: 'live' as const, categoryId: '102' },
      { id: 's3', title: 'Sport 3', posterUrl: '', type: 'live' as const, categoryId: '103' },
      { id: 'g1', title: 'General 1', posterUrl: '', type: 'live' as const, categoryId: '201' },
      { id: 'g2', title: 'General 2', posterUrl: '', type: 'live' as const, categoryId: '202' },
    ];

    // Selecting any of the sport categories matches all sport items
    expect(
      filterItemsBySmartCategory(streamItems, '101', new Set(), [], mergedCats).map((i) => i.id),
    ).toEqual(['s1', 's2', 's3']);
    expect(
      filterItemsBySmartCategory(streamItems, '102', new Set(), [], mergedCats).map((i) => i.id),
    ).toEqual(['s1', 's2', 's3']);

    // Selecting any of the general categories matches all general items
    expect(
      filterItemsBySmartCategory(streamItems, '201', new Set(), [], mergedCats).map((i) => i.id),
    ).toEqual(['g1', 'g2']);

    // Quality variant categories e.g. Macedonia HD (56) and Macedonia (54) match all items
    const mkCats = [
      { category_id: 301, category_name: 'MK| Macedonia HD' },
      { category_id: 302, category_name: 'MK| Macedonia' },
    ];
    const mkItems = [
      { id: 'mk1', title: 'MRT 1 HD', posterUrl: '', type: 'live' as const, categoryId: '301' },
      { id: 'mk2', title: 'MRT 2', posterUrl: '', type: 'live' as const, categoryId: '302' },
    ];
    expect(
      filterItemsBySmartCategory(mkItems, '301', new Set(), [], mkCats).map((i) => i.id),
    ).toEqual(['mk1', 'mk2']);
  });

  it('filters by smart:recent and smart:top-rated', () => {
    const movieItems = [
      { id: 'm1', title: 'Old Classic', posterUrl: '', added: '100', rating: 6.5 },
      { id: 'm2', title: 'New Blockbuster', posterUrl: '', added: '300', rating: 8.5 },
      { id: 'm3', title: 'Mid Release', posterUrl: '', added: '200', rating: 7.2 },
      { id: 'm4', title: 'Unknown Date', posterUrl: '', rating: 9.1 },
    ];

    expect(
      filterItemsBySmartCategory(movieItems, 'smart:recent', new Set()).map((i) => i.id),
    ).toEqual(['m2', 'm3', 'm1']);

    expect(
      filterItemsBySmartCategory(movieItems, 'smart:top-rated', new Set()).map((i) => i.id),
    ).toEqual(['m4', 'm2', 'm3']);
  });

  it('sorts catalog items by all supported sort modes', () => {
    const catalog = [
      {
        id: '1',
        title: 'Interstellar',
        year: '2014',
        rating: 8.7,
        added: '1700000000',
        posterUrl: '',
      },
      { id: '2', title: 'Avatar', year: '2009', rating: 7.9, added: '1600000000', posterUrl: '' },
      {
        id: '3',
        title: 'Dune: Part Two',
        year: '2024',
        rating: 8.9,
        added: '1800000000',
        posterUrl: '',
      },
    ];

    expect(sortCatalogItems(catalog, 'default').map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(sortCatalogItems(catalog, 'recently-added').map((i) => i.id)).toEqual(['3', '1', '2']);
    expect(sortCatalogItems(catalog, 'year-desc').map((i) => i.id)).toEqual(['3', '1', '2']);
    expect(sortCatalogItems(catalog, 'year-asc').map((i) => i.id)).toEqual(['2', '1', '3']);
    expect(sortCatalogItems(catalog, 'rating').map((i) => i.id)).toEqual(['3', '1', '2']);
    expect(sortCatalogItems(catalog, 'name-asc').map((i) => i.id)).toEqual(['2', '3', '1']);
    expect(sortCatalogItems(catalog, 'name-desc').map((i) => i.id)).toEqual(['1', '3', '2']);
  });

  it('compares titles numerically and ignoring case and accents, with undated titles last by year', () => {
    const titles = [
      { id: 'a', title: 'Movie 10', posterUrl: '', year: '2001' },
      { id: 'b', title: 'movie 2', posterUrl: '' },
      { id: 'c', title: 'Émile', posterUrl: '', year: '1999' },
      { id: 'd', title: 'Movie 1', posterUrl: '', year: '2001', added: '5' },
      { id: 'e', title: 'Edge', posterUrl: '', year: '2001', added: '9' },
    ];

    expect(sortCatalogItems(titles, 'name-asc').map((item) => item.title)).toEqual([
      'Edge',
      'Émile',
      'Movie 1',
      'movie 2',
      'Movie 10',
    ]);
    expect(sortCatalogItems(titles, 'name-desc').map((item) => item.id)).toEqual([
      'a',
      'b',
      'd',
      'c',
      'e',
    ]);
    expect(sortCatalogItems(titles, 'year-asc').map((item) => item.id)).toEqual([
      'c',
      'e',
      'd',
      'a',
      'b',
    ]);
    expect(sortCatalogItems(titles, 'year-desc').map((item) => item.id)).toEqual([
      'e',
      'd',
      'a',
      'c',
      'b',
    ]);
    // Sorting never reorders the caller's array.
    expect(titles.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('filters items by genre and extracts available genres', () => {
    const media = [
      { id: '1', title: 'Mad Max: Fury Road', genre: 'Action, Sci-Fi', posterUrl: '' },
      { id: '2', title: 'Superbad', genre: 'Comedy', posterUrl: '' },
      { id: '3', title: 'Alien', genre: 'Horror, Sci-Fi', posterUrl: '' },
    ];

    expect(filterItemsByGenre(media, 'Action').map((i) => i.id)).toEqual(['1']);
    expect(filterItemsByGenre(media, 'Sci-Fi').map((i) => i.id)).toEqual(['1', '3']);
    expect(filterItemsByGenre(media, null).map((i) => i.id)).toEqual(['1', '2', '3']);

    const available = getAvailableGenres(media);
    const genreNames = available.map((g) => g.genre);
    expect(genreNames).toContain('Action');
    expect(genreNames).toContain('Comedy');
    expect(genreNames).toContain('Sci-Fi');
    expect(genreNames).toContain('Horror');
    expect(available.find((g) => g.genre === 'Sci-Fi')?.count).toBe(2);
  });

  describe('ranking with TMDB checks', () => {
    const rated = [
      { id: 'bogus', title: 'City of Bloods', posterUrl: '', rating: 9.4 },
      { id: 'classic', title: 'Classic', posterUrl: '', rating: 8.6 },
      { id: 'thin', title: 'Thin', posterUrl: '', rating: 8.1 },
      { id: 'solid', title: 'Solid', posterUrl: '', rating: 7.6 },
      { id: 'unchecked', title: 'Unchecked', posterUrl: '', rating: 7.2 },
      { id: 'unrated', title: 'Unrated', posterUrl: '' },
    ];
    const lookups: RatingLookups = new Map([
      ['bogus', { status: 'matched', voteAverage: 4.8, voteCount: 212 }],
      ['classic', { status: 'matched', voteAverage: 8.5, voteCount: 25_000 }],
      ['thin', { status: 'matched', voteAverage: 9.6, voteCount: 3 }],
      ['solid', { status: 'failed' }],
    ]);

    it('rates each item by TMDB where checked and by the provider elsewhere', () => {
      expect(effectiveItemRating(rated[0]!, lookups)).toEqual({
        value: 4.8,
        source: 'tmdb',
        voteCount: 212,
      });
      expect(effectiveItemRating(rated[2]!, lookups)).toBeNull();
      expect(effectiveItemRating(rated[3]!, lookups)).toEqual({ value: 7.6, source: 'provider' });
      expect(effectiveItemRating(rated[0]!)).toEqual({ value: 9.4, source: 'provider' });
    });

    it('ranks by the rating shown, with votes deciding ties', () => {
      const close = [
        { id: 'many', title: 'Many Votes', posterUrl: '', rating: 7 },
        { id: 'few', title: 'Few Votes', posterUrl: '', rating: 7 },
        { id: 'top', title: 'Top', posterUrl: '', rating: 7 },
      ];
      const checked: RatingLookups = new Map([
        ['many', { status: 'matched', voteAverage: 8.5, voteCount: 25_000 }],
        ['few', { status: 'matched', voteAverage: 8.5, voteCount: 40 }],
        ['top', { status: 'matched', voteAverage: 9.1, voteCount: 40 }],
      ]);
      expect(sortCatalogItems(close, 'rating', checked).map((item) => item.id)).toEqual([
        'top',
        'many',
        'few',
      ]);
    });

    it('sorts checked ratings ahead and drops titles TMDB rates poorly or too thinly', () => {
      expect(sortCatalogItems(rated, 'rating', lookups).map((item) => item.id)).toEqual([
        'classic',
        'solid',
        'unchecked',
        'bogus',
        'thin',
        'unrated',
      ]);
      // Without checks the provider order stands.
      expect(sortCatalogItems(rated, 'rating').map((item) => item.id)).toEqual([
        'bogus',
        'classic',
        'thin',
        'solid',
        'unchecked',
        'unrated',
      ]);
    });

    it('keeps only titles rated 7 or better in Top Rated, judged by TMDB where checked', () => {
      expect(
        filterItemsBySmartCategory(
          rated,
          'smart:top-rated',
          new Set(),
          [],
          [],
          undefined,
          lookups,
        ).map((item) => item.id),
      ).toEqual(['classic', 'solid', 'unchecked']);
    });
  });

  describe('genres for films without a genre field', () => {
    const categories = new Map([
      ['de-comedy', 'DE | Komödien'],
      ['de-crime', 'DE | KRIMI'],
      ['de-scifi', 'DE | Science-Fiction'],
      ['es-docs', 'ES | Documentales'],
      ['fr-anim', 'FR | Animation & Dessins animés'],
      ['de-new', 'DE | Neu im Kino'],
    ]);
    const films = [
      { id: 'f1', title: 'Ein Film', posterUrl: '', categoryId: 'de-comedy' },
      { id: 'f2', title: 'Zweiter Film', posterUrl: '', categoryId: 'de-crime' },
      { id: 'f3', title: 'Dritter Film', posterUrl: '', categoryId: 'de-scifi' },
      { id: 'f4', title: 'Cuarta', posterUrl: '', categoryId: 'es-docs' },
      { id: 'f5', title: 'Cinquième', posterUrl: '', categoryId: 'fr-anim' },
      { id: 'f6', title: 'Brandneu', posterUrl: '', categoryId: 'de-new' },
      { id: 'f7', title: 'Auch Neu', posterUrl: '', categoryId: 'de-new' },
    ];

    it('reads genres from category names in the languages Movena ships', () => {
      expect(getAvailableGenres(films, categories)).toEqual([
        { genre: 'Comedy', count: 1 },
        { genre: 'Sci-Fi', count: 1 },
        { genre: 'Animation', count: 1 },
        { genre: 'Crime', count: 1 },
        { genre: 'Documentary', count: 1 },
      ]);
      expect(filterItemsByGenre(films, 'Crime', categories).map((film) => film.id)).toEqual(['f2']);
    });

    it('adds the genres TMDB named for checked titles to what the provider says', () => {
      const lookups: RatingLookups = new Map([
        [
          'f6',
          { status: 'matched', voteAverage: 7.4, voteCount: 800, genres: ['Action', 'Comedy'] },
        ],
        ['f1', { status: 'matched', voteAverage: 6.9, voteCount: 300, genres: ['Drama'] }],
        ['f7', { status: 'unmatched' }],
      ]);

      expect(filterItemsByGenre(films, 'Action', categories, lookups).map((f) => f.id)).toEqual([
        'f6',
      ]);
      // The provider's own category still counts next to TMDB's genres.
      expect(filterItemsByGenre(films, 'Comedy', categories, lookups).map((f) => f.id)).toEqual([
        'f1',
        'f6',
      ]);
      expect(getAvailableGenres(films, categories, lookups)).toContainEqual({
        genre: 'Drama',
        count: 1,
      });
    });

    it('tells titles with a known genre from those nothing names yet', () => {
      const lookups: RatingLookups = new Map([
        ['f6', { status: 'matched', voteAverage: 7.4, voteCount: 800, genres: ['Action'] }],
      ]);
      expect(itemHasKnownGenre(films[0]!, categories)).toBe(true);
      expect(itemHasKnownGenre(films[5]!, categories)).toBe(false);
      expect(itemHasKnownGenre(films[5]!, categories, lookups)).toBe(true);
      expect(itemMatchesGenre(films[5]!, 'Action', categories, lookups)).toBe(true);
      expect(itemMatchesGenre(films[6]!, 'Action', categories, lookups)).toBe(false);
    });
  });
});
