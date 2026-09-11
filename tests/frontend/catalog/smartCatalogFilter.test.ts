import { describe, expect, it } from 'vitest';
import {
  filterItemsBySmartCategory,
  filterItemsByGenre,
  getAvailableGenres,
  sortCatalogItems,
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
});
