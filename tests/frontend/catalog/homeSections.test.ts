import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_SECTIONS,
  HOME_SECTION_IDS,
  moveHomeSection,
  sanitizeHomeSections,
} from '@/modules/catalog/lib/homeSections';

describe('sanitizeHomeSections', () => {
  it('returns the full default order for non-array input', () => {
    expect(sanitizeHomeSections(undefined)).toEqual(DEFAULT_HOME_SECTIONS);
    expect(sanitizeHomeSections(null)).toEqual(DEFAULT_HOME_SECTIONS);
    expect(sanitizeHomeSections('nope')).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it('preserves a valid persisted order and enabled flags', () => {
    const persisted = [
      { id: 'liveChannels', enabled: false },
      { id: 'popularMovies', enabled: true },
    ];
    const result = sanitizeHomeSections(persisted);

    expect(result[0]).toEqual({ id: 'liveChannels', enabled: false });
    expect(result[1]).toEqual({ id: 'popularMovies', enabled: true });
    // Every known section is still present, just appended after the persisted ones.
    expect(result.map((section) => section.id).sort()).toEqual([...HOME_SECTION_IDS].sort());
  });

  it('drops unknown and duplicate ids, defaulting a missing enabled flag to true', () => {
    const result = sanitizeHomeSections([
      { id: 'recentMovies' },
      { id: 'recentMovies', enabled: false },
      { id: 'not-a-real-section', enabled: true },
      { id: 'popularSeries', enabled: 'yes' },
    ]);

    expect(result[0]).toEqual({ id: 'recentMovies', enabled: true });
    expect(result.filter((section) => section.id === 'recentMovies')).toHaveLength(1);
    expect(result.some((section) => (section.id as string) === 'not-a-real-section')).toBe(false);
    // A non-boolean `enabled` only counts as false when it's literally `false`.
    expect(result.find((section) => section.id === 'popularSeries')).toEqual({
      id: 'popularSeries',
      enabled: true,
    });
  });

  it('appends a section missing from an older saved layout instead of dropping it', () => {
    const result = sanitizeHomeSections([{ id: 'recentMovies', enabled: true }]);
    expect(result).toHaveLength(HOME_SECTION_IDS.length);
    expect(result[result.length - 1]!.id).not.toBe('recentMovies');
  });
});

describe('moveHomeSection', () => {
  it('swaps a section with its neighbor in the requested direction', () => {
    const sections = DEFAULT_HOME_SECTIONS;
    const movedDown = moveHomeSection(sections, 0, 1);
    expect(movedDown.map((section) => section.id)).toEqual([
      'continueWatching',
      'upcoming',
      'recentMovies',
      'recentSeries',
      'popularMovies',
      'popularSeries',
      'liveChannels',
    ]);

    const movedUp = moveHomeSection(movedDown, 1, -1);
    expect(movedUp).toEqual(sections);
  });

  it('is a no-op at either boundary', () => {
    const sections = DEFAULT_HOME_SECTIONS;
    expect(moveHomeSection(sections, 0, -1)).toBe(sections);
    expect(moveHomeSection(sections, sections.length - 1, 1)).toBe(sections);
  });

  it('never mutates the input array', () => {
    const sections = DEFAULT_HOME_SECTIONS.map((section) => ({ ...section }));
    const snapshot = sections.map((section) => section.id);
    moveHomeSection(sections, 2, 1);
    expect(sections.map((section) => section.id)).toEqual(snapshot);
  });
});
