import type { MediaItem } from '../model/media';
import type { CatalogSortMode } from '@/modules/settings/public/store/useSettingsStore';
import { parseCategoryName } from '@/shared/lib/categoryName';
import { isUltraHdQuality } from '@/shared/lib/mediaTags';

export interface SmartCatalogItem extends MediaItem {
  categoryId?: string | undefined;
}

export interface CategoryLike {
  category_id: string | number;
  category_name: string;
}

const decodeHtml = (html: string) => {
  if (!html) return '';
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
};

const COMMON_GENRES = [
  'Action',
  'Comedy',
  'Drama',
  'Sci-Fi',
  'Thriller',
  'Horror',
  'Animation',
  'Adventure',
  'Romance',
  'Crime',
  'Documentary',
  'Fantasy',
  'Family',
  'Mystery',
] as const;

export type KnownGenre = (typeof COMMON_GENRES)[number];

const GENRE_MATCHERS = new Map<KnownGenre, RegExp>(
  COMMON_GENRES.map((genre) => [
    genre,
    new RegExp(
      `\\b(?:${genre === 'Sci-Fi' ? 'sci-?fi|science fiction' : genre.toLowerCase()})\\b`,
      'i',
    ),
  ]),
);

function matchItemGenre(
  item: SmartCatalogItem,
  genre: string,
  categoryNameMap?: Map<string, string>,
): boolean {
  if (!genre || genre === 'All') return true;
  const target = genre.toLowerCase();

  if (item.genre && item.genre.toLowerCase().includes(target)) return true;
  if (Array.isArray(item.genres) && item.genres.some((g) => g.toLowerCase().includes(target)))
    return true;

  if (item.categoryId && categoryNameMap) {
    const catName = categoryNameMap.get(item.categoryId);
    if (catName && catName.toLowerCase().includes(target)) return true;
  }

  const regex =
    GENRE_MATCHERS.get(genre as KnownGenre) ??
    new RegExp(`\\b(?:${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
  if (regex.test(item.title)) return true;
  if (item.description && regex.test(item.description)) return true;

  return false;
}

export function filterItemsByGenre<T extends SmartCatalogItem>(
  items: T[],
  genre: string | null,
  categoryNameMap?: Map<string, string>,
): T[] {
  if (!genre || genre === 'All') return items;
  return items.filter((item) => matchItemGenre(item, genre, categoryNameMap));
}

export function getAvailableGenres<T extends SmartCatalogItem>(
  items: T[],
  categoryNameMap?: Map<string, string>,
): { genre: KnownGenre; count: number }[] {
  if (items.length === 0) return [];
  const counts = new Map<KnownGenre, number>();

  for (const item of items) {
    const genreText = item.genre?.toLowerCase() ?? '';
    const genreList = Array.isArray(item.genres)
      ? item.genres.map((genre) => genre.toLowerCase())
      : [];
    const categoryText =
      item.categoryId && categoryNameMap
        ? (categoryNameMap.get(item.categoryId)?.toLowerCase() ?? '')
        : '';
    const title = item.title ?? '';
    const description = item.description ?? '';

    for (const genre of COMMON_GENRES) {
      const target = genre.toLowerCase();
      const matchesMetadata =
        genreText.includes(target) ||
        genreList.some((candidate) => candidate.includes(target)) ||
        categoryText.includes(target);
      const matcher = GENRE_MATCHERS.get(genre)!;
      if (matchesMetadata || matcher.test(title) || matcher.test(description)) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1);
      }
    }
  }

  return COMMON_GENRES.flatMap((genre) => {
    const count = counts.get(genre) ?? 0;
    return count > 0 ? [{ genre, count }] : [];
  });
}

export function sortCatalogItems<T extends SmartCatalogItem>(
  items: T[],
  sortMode: CatalogSortMode = 'default',
): T[] {
  if (sortMode === 'default' || items.length <= 1) return items;

  const sorted = [...items];

  switch (sortMode) {
    case 'recently-added':
      return sorted.sort((a, b) => {
        const addedA = Number.parseInt(a.added || '0', 10) || 0;
        const addedB = Number.parseInt(b.added || '0', 10) || 0;
        if (addedA !== addedB) return addedB - addedA;
        const yearA =
          typeof a.year === 'number' ? a.year : Number.parseInt(String(a.year || '0'), 10) || 0;
        const yearB =
          typeof b.year === 'number' ? b.year : Number.parseInt(String(b.year || '0'), 10) || 0;
        if (yearA !== yearB) return yearB - yearA;
        return (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      });

    case 'year-desc':
      return sorted.sort((a, b) => {
        const yearA =
          typeof a.year === 'number' ? a.year : Number.parseInt(String(a.year || '0'), 10) || 0;
        const yearB =
          typeof b.year === 'number' ? b.year : Number.parseInt(String(b.year || '0'), 10) || 0;
        if (yearA !== yearB) return yearB - yearA;
        const addedA = Number.parseInt(a.added || '0', 10) || 0;
        const addedB = Number.parseInt(b.added || '0', 10) || 0;
        if (addedA !== addedB) return addedB - addedA;
        return (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      });

    case 'year-asc':
      return sorted.sort((a, b) => {
        const yearA =
          typeof a.year === 'number' ? a.year : Number.parseInt(String(a.year || '0'), 10) || 9999;
        const yearB =
          typeof b.year === 'number' ? b.year : Number.parseInt(String(b.year || '0'), 10) || 9999;
        if (yearA !== yearB) return yearA - yearB;
        return (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      });

    case 'rating':
      return sorted.sort((a, b) => {
        const ratingA =
          typeof a.rating === 'number' ? a.rating : Number.parseFloat(String(a.rating || '0')) || 0;
        const ratingB =
          typeof b.rating === 'number' ? b.rating : Number.parseFloat(String(b.rating || '0')) || 0;
        if (ratingA !== ratingB) return ratingB - ratingA;
        const yearA =
          typeof a.year === 'number' ? a.year : Number.parseInt(String(a.year || '0'), 10) || 0;
        const yearB =
          typeof b.year === 'number' ? b.year : Number.parseInt(String(b.year || '0'), 10) || 0;
        if (yearA !== yearB) return yearB - yearA;
        return (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      });

    case 'name-asc':
      return sorted.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
      );

    case 'name-desc':
      return sorted.sort((a, b) =>
        (b.title || '').localeCompare(a.title || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
      );

    default:
      return items;
  }
}

export function filterItemsBySmartCategory<T extends SmartCatalogItem>(
  items: T[],
  activeCategoryId: string | null,
  hiddenCategoryIds: Set<string>,
  favorites: { id: string }[] = [],
  categories: CategoryLike[] = [],
  verifiedResolutions?: ReadonlyMap<string, string>,
): T[] {
  if (!activeCategoryId) {
    return items.filter((s) => !s.categoryId || !hiddenCategoryIds.has(s.categoryId));
  }

  if (activeCategoryId.startsWith('country:')) {
    const targetCountry = activeCategoryId.slice('country:'.length);
    const targetCategoryIds = new Set<string>();

    if (categories && categories.length > 0) {
      for (const cat of categories) {
        const catId = String(cat.category_id);
        const parsed = parseCategoryName(decodeHtml(cat.category_name || ''));
        const cKey = parsed.country ?? 'other';
        if (cKey === targetCountry) {
          targetCategoryIds.add(catId);
        }
      }
    }

    return items.filter(
      (s) =>
        s.categoryId && targetCategoryIds.has(s.categoryId) && !hiddenCategoryIds.has(s.categoryId),
    );
  }

  if (activeCategoryId === 'smart:favorites') {
    const favIds = new Set(favorites.map((f) => f.id));
    return items.filter(
      (s) => favIds.has(s.id) && (!s.categoryId || !hiddenCategoryIds.has(s.categoryId)),
    );
  }

  if (activeCategoryId === 'smart:recent') {
    const visible = items.filter(
      (s) => (!s.categoryId || !hiddenCategoryIds.has(s.categoryId)) && Boolean(s.added),
    );
    return [...visible].sort((a, b) => {
      const addedA = Number.parseInt(a.added || '0', 10) || 0;
      const addedB = Number.parseInt(b.added || '0', 10) || 0;
      return addedB - addedA;
    });
  }

  if (activeCategoryId === 'smart:top-rated') {
    const visible = items.filter((s) => !s.categoryId || !hiddenCategoryIds.has(s.categoryId));
    return visible
      .filter((s) => typeof s.rating === 'number' && s.rating >= 7.0)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  if (activeCategoryId === 'smart:4k') {
    return items.filter(
      (s) =>
        (!s.categoryId || !hiddenCategoryIds.has(s.categoryId)) &&
        isUltraHdQuality(s, verifiedResolutions?.get(s.id)),
    );
  }

  if (activeCategoryId === 'smart:sports') {
    return items.filter(
      (s) =>
        (!s.categoryId || !hiddenCategoryIds.has(s.categoryId)) &&
        /\b(sport|sports|espn|f1|formula|ufc|football|soccer|racing|wwe|motogp|nba|nfl)\b/i.test(
          s.title,
        ),
    );
  }

  if (activeCategoryId === 'smart:news') {
    return items.filter(
      (s) =>
        (!s.categoryId || !hiddenCategoryIds.has(s.categoryId)) &&
        /\b(news|cnn|bbc|bloomberg|cnbc|al jazeera|euronews|fox news|msnbc)\b/i.test(s.title),
    );
  }

  if (activeCategoryId === 'smart:kids') {
    return items.filter(
      (s) =>
        (!s.categoryId || !hiddenCategoryIds.has(s.categoryId)) &&
        /\b(kids|disney|nick|nickelodeon|cartoon|junior|boomer|super rtl|cbeebies)\b/i.test(
          s.title,
        ),
    );
  }

  // Match all sibling categories sharing the same parsed country and label
  const targetCategoryIds = new Set<string>([activeCategoryId]);
  if (categories && categories.length > 0) {
    const activeCat = categories.find((c) => String(c.category_id) === activeCategoryId);
    if (activeCat) {
      const activeParsed = parseCategoryName(decodeHtml(activeCat.category_name || ''));
      for (const cat of categories) {
        const catId = String(cat.category_id);
        const parsed = parseCategoryName(decodeHtml(cat.category_name || ''));
        if (
          parsed.country === activeParsed.country &&
          parsed.label.toLowerCase() === activeParsed.label.toLowerCase()
        ) {
          targetCategoryIds.add(catId);
        }
      }
    }
  }

  return items.filter(
    (s) =>
      s.categoryId && targetCategoryIds.has(s.categoryId) && !hiddenCategoryIds.has(s.categoryId),
  );
}
