import type { MediaItem } from '../model/media';
import type { CatalogSortMode } from '@/modules/settings/public/store/useSettingsStore';
import { parseProviderCategoryName } from '@/shared/lib/categoryName';
import { isUltraHdQuality } from '@/shared/lib/mediaTags';
import {
  compareRatings,
  providerRatingValue,
  resolveMediaRating,
  TMDB_RATING_OFF,
  TOP_RATED_MIN_RATING,
  type MediaRating,
  type TmdbRatingLookup,
} from '@/shared/lib/rating';

export interface SmartCatalogItem extends MediaItem {
  categoryId?: string | undefined;
}

export interface CategoryLike {
  category_id: string | number;
  category_name: string;
}

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

/**
 * How providers spell each genre in category names and genre fields, across
 * the languages Movena ships ("DE | Komödie", "Krimi", "Ciencia ficción").
 * Compared without accents or case and as substrings, so plurals such as
 * "Komödien" match. Titles keep the English word match: there a genre word is
 * more often simply part of the name.
 */
const GENRE_SPELLINGS: Readonly<Record<KnownGenre, readonly string[]>> = {
  Action: ['action', 'accion', 'azione', 'akcja', 'acao', 'actie'],
  Comedy: ['comedy', 'komodie', 'komoedie', 'comedia', 'comedie', 'commedia', 'komedie', 'komedia'],
  Drama: ['drama', 'drame', 'dramma', 'dramat'],
  'Sci-Fi': [
    'sci-fi',
    'scifi',
    'sci fi',
    'science fiction',
    'science-fiction',
    'sciencefiction',
    'ciencia ficcion',
    'ciencia-ficcion',
    'fantascienza',
    'ficcao cientifica',
    'fantastyka naukowa',
  ],
  Thriller: ['thriller', 'suspens'],
  Horror: ['horror', 'terror', 'epouvante', 'orrore', 'grusel'],
  Animation: [
    'animation',
    'animated',
    'zeichentrick',
    'animacion',
    'animazione',
    'animatie',
    'animacja',
    'animacao',
    'anime',
    'cartoon',
  ],
  Adventure: ['adventure', 'abenteuer', 'aventura', 'aventure', 'avventura', 'avontuur', 'przygod'],
  Romance: ['romance', 'romantik', 'romantic', 'romantiek', 'romans', 'liebesfilm'],
  Crime: [
    'crime',
    'krimi',
    'crimen',
    'policier',
    'poliziesco',
    'misdaad',
    'kryminał',
    'kryminal',
    'policial',
  ],
  Documentary: ['documentary', 'documental', 'documentaire', 'documentario', 'doku', 'dokument'],
  Fantasy: ['fantasy', 'fantasia', 'fantastique', 'fantastico'],
  Family: ['family', 'familie', 'familia', 'famille', 'famiglia', 'rodzin', 'kinder', 'kids'],
  Mystery: ['mystery', 'misterio', 'mystere', 'mistero', 'mysterie', 'tajemnic'],
};

function foldGenreText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

interface GenreSources {
  /** TMDB's genres, once a rating check has found the title. */
  tmdb: readonly string[] | undefined;
  /** Provider genre fields and the category name, folded for comparison. */
  metadata: string[];
  title: string;
  description: string;
}

function genreSources(
  item: SmartCatalogItem,
  categoryNameMap?: Map<string, string>,
  ratingLookups?: RatingLookups,
): GenreSources {
  const verdict = ratingLookups?.get(item.id);
  const categoryName =
    item.categoryId && categoryNameMap ? categoryNameMap.get(item.categoryId) : undefined;
  return {
    tmdb: verdict?.status === 'matched' ? verdict.genres : undefined,
    metadata: [item.genre, ...(Array.isArray(item.genres) ? item.genres : []), categoryName]
      .filter((value): value is string => Boolean(value))
      .map(foldGenreText),
    title: item.title ?? '',
    description: item.description ?? '',
  };
}

function sourcesMatchGenre(sources: GenreSources, genre: string): boolean {
  if (sources.tmdb?.includes(genre)) return true;
  const spellings = GENRE_SPELLINGS[genre as KnownGenre] ?? [foldGenreText(genre)];
  if (sources.metadata.some((text) => spellings.some((spelling) => text.includes(spelling))))
    return true;
  const regex =
    GENRE_MATCHERS.get(genre as KnownGenre) ??
    new RegExp(`\\b(?:${genre.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
  return (
    regex.test(sources.title) || (sources.description !== '' && regex.test(sources.description))
  );
}

/**
 * Genres come from TMDB for every title a rating check has found, and from
 * the provider's genre fields, category names and titles otherwise. Movie
 * lists from Xtream carry no genre field at all, so for films these are the
 * only sources.
 */
export function filterItemsByGenre<T extends SmartCatalogItem>(
  items: T[],
  genre: string | null,
  categoryNameMap?: Map<string, string>,
  ratingLookups?: RatingLookups,
): T[] {
  if (!genre || genre === 'All') return items;
  return items.filter((item) =>
    sourcesMatchGenre(genreSources(item, categoryNameMap, ratingLookups), genre),
  );
}

/** Whether the title belongs to the genre by anything known about it. */
export function itemMatchesGenre(
  item: SmartCatalogItem,
  genre: string,
  categoryNameMap?: Map<string, string>,
  ratingLookups?: RatingLookups,
): boolean {
  return sourcesMatchGenre(genreSources(item, categoryNameMap, ratingLookups), genre);
}

/** Whether anything about the title names a genre at all. */
export function itemHasKnownGenre(
  item: SmartCatalogItem,
  categoryNameMap?: Map<string, string>,
  ratingLookups?: RatingLookups,
): boolean {
  const sources = genreSources(item, categoryNameMap, ratingLookups);
  return COMMON_GENRES.some((genre) => sourcesMatchGenre(sources, genre));
}

export function getAvailableGenres<T extends SmartCatalogItem>(
  items: T[],
  categoryNameMap?: Map<string, string>,
  ratingLookups?: RatingLookups,
): { genre: KnownGenre; count: number }[] {
  if (items.length === 0) return [];
  const counts = new Map<KnownGenre, number>();

  for (const item of items) {
    const sources = genreSources(item, categoryNameMap, ratingLookups);
    for (const genre of COMMON_GENRES) {
      if (sourcesMatchGenre(sources, genre)) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  return COMMON_GENRES.flatMap((genre) => {
    const count = counts.get(genre) ?? 0;
    return count > 0 ? [{ genre, count }] : [];
  });
}

/** TMDB checks by catalogue item id. Items without one keep their provider rating. */
export type RatingLookups = ReadonlyMap<string, TmdbRatingLookup>;

/** The rating a list shows and ranks an item by. */
export function effectiveItemRating(
  item: Pick<MediaItem, 'id' | 'rating'>,
  ratingLookups?: RatingLookups,
): MediaRating | null {
  return resolveMediaRating(
    ratingLookups?.get(item.id) ?? TMDB_RATING_OFF,
    providerRatingValue(item.rating),
  );
}

/**
 * One collator for every title comparison. `localeCompare` with options builds
 * a new collator per call, which made sorting a 25,000-title catalogue by name
 * take a third of a second instead of a few milliseconds.
 */
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function yearNumber(year: string | number | undefined, missing: number): number {
  return typeof year === 'number' ? year : Number.parseInt(String(year || '0'), 10) || missing;
}

/** Everything a comparison reads, derived once per item rather than per comparison. */
interface SortEntry<T> {
  item: T;
  title: string;
  added: number;
  year: number;
  rating: MediaRating | null;
}

export function sortCatalogItems<T extends SmartCatalogItem>(
  items: T[],
  sortMode: CatalogSortMode = 'default',
  ratingLookups?: RatingLookups,
): T[] {
  if (sortMode === 'default' || items.length <= 1) return items;

  const byTitle = (a: SortEntry<T>, b: SortEntry<T>) => titleCollator.compare(a.title, b.title);
  let compare: (a: SortEntry<T>, b: SortEntry<T>) => number;
  switch (sortMode) {
    case 'recently-added':
      compare = (a, b) => b.added - a.added || b.year - a.year || byTitle(a, b);
      break;
    case 'year-desc':
      compare = (a, b) => b.year - a.year || b.added - a.added || byTitle(a, b);
      break;
    case 'year-asc':
      // Undated titles go last here, as if from the far future.
      compare = (a, b) => a.year - b.year || byTitle(a, b);
      break;
    case 'rating':
      // Unrated items, including those TMDB has too few votes for, go last.
      compare = (a, b) => compareRatings(a.rating, b.rating) || b.year - a.year || byTitle(a, b);
      break;
    case 'name-asc':
      compare = byTitle;
      break;
    case 'name-desc':
      compare = (a, b) => byTitle(b, a);
      break;
    default:
      return items;
  }

  const entries = items.map((item): SortEntry<T> => ({
    item,
    title: item.title || '',
    added: Number.parseInt(item.added || '0', 10) || 0,
    year: yearNumber(item.year, sortMode === 'year-asc' ? 9999 : 0),
    rating: sortMode === 'rating' ? effectiveItemRating(item, ratingLookups) : null,
  }));
  return entries.sort(compare).map((entry) => entry.item);
}

export function filterItemsBySmartCategory<T extends SmartCatalogItem>(
  items: T[],
  activeCategoryId: string | null,
  hiddenCategoryIds: Set<string>,
  favorites: { id: string }[] = [],
  categories: CategoryLike[] = [],
  verifiedResolutions?: ReadonlyMap<string, string>,
  ratingLookups?: RatingLookups,
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
        const parsed = parseProviderCategoryName(cat.category_name || '');
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
    const topRated = visible.filter(
      (s) => (effectiveItemRating(s, ratingLookups)?.value ?? 0) >= TOP_RATED_MIN_RATING,
    );
    return sortCatalogItems(topRated, 'rating', ratingLookups);
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
      const activeParsed = parseProviderCategoryName(activeCat.category_name || '');
      for (const cat of categories) {
        const catId = String(cat.category_id);
        const parsed = parseProviderCategoryName(cat.category_name || '');
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
