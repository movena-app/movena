/** Pure domain rules for the user-customizable Discover/home page row layout. */

export const HOME_SECTION_IDS = [
  'upcoming',
  'continueWatching',
  'recentMovies',
  'recentSeries',
  'popularMovies',
  'popularSeries',
  'liveChannels',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export interface HomeSectionPref {
  id: HomeSectionId;
  enabled: boolean;
}

/** Display order matches Movena's original fixed Discover layout. */
export const DEFAULT_HOME_SECTIONS: HomeSectionPref[] = HOME_SECTION_IDS.map((id) => ({
  id,
  enabled: true,
}));

/** User-facing label per section, used by both Discover and its settings section. */
export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  upcoming: 'Coming Up',
  continueWatching: 'Continue Watching',
  recentMovies: 'Recently Added Movies',
  recentSeries: 'Recently Added Series',
  popularMovies: 'Popular Movies',
  popularSeries: 'Popular Series',
  liveChannels: 'Live TV Channels',
};

function isHomeSectionId(value: unknown): value is HomeSectionId {
  return typeof value === 'string' && (HOME_SECTION_IDS as readonly string[]).includes(value);
}

/**
 * Validates and repairs a persisted section-order list. Unknown or duplicate
 * entries are dropped; any section missing from an older/corrupt save (for
 * example one written before a new row existed) is appended so it still
 * shows up rather than silently disappearing.
 */
export function sanitizeHomeSections(value: unknown): HomeSectionPref[] {
  const seen = new Set<HomeSectionId>();
  const result: HomeSectionPref[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const id = (entry as { id?: unknown }).id;
      if (!isHomeSectionId(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({ id, enabled: (entry as { enabled?: unknown }).enabled !== false });
    }
  }

  for (const id of HOME_SECTION_IDS) {
    if (!seen.has(id)) result.push({ id, enabled: true });
  }

  return result;
}

export function moveHomeSection(
  sections: HomeSectionPref[],
  index: number,
  direction: -1 | 1,
): HomeSectionPref[] {
  const target = index + direction;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  const [moved] = next.splice(index, 1);
  if (!moved) return sections;
  next.splice(target, 0, moved);
  return next;
}
