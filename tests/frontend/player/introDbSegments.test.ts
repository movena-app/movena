import { describe, expect, it } from 'vitest';
import { resolvePlaybackPromptSegments } from '@/modules/playback/lib/chapters';

describe('resolvePlaybackPromptSegments (chapters + IntroDB merge)', () => {
  it('prefers embedded chapter markers over IntroDB segments for intro and outro', () => {
    const chapters = [
      { title: 'Intro', time: 10 },
      { title: 'Main Episode', time: 80 },
      { title: 'Credits', time: 2100 },
    ];

    const introDbSegments = {
      intro: { startSec: 15, endSec: 90 },
      recap: { startSec: 0, endSec: 15 },
      outro: { startSec: 2050, endSec: 2200 },
    };

    const result = resolvePlaybackPromptSegments(chapters, introDbSegments);

    // Chapter intro should win over IntroDB intro
    expect(result.intro).toEqual({ start: 10, skipTo: 80 });
    // IntroDB recap should be used (chapters don't define recap)
    expect(result.recap).toEqual({ start: 0, skipTo: 15 });
    // Chapter outro should win over IntroDB outro
    expect(result.outro).toEqual({ start: 2100 });
  });

  it('falls back to IntroDB when no chapter markers are present', () => {
    const chapters: { title: string; time: number }[] = [];

    const introDbSegments = {
      intro: { startSec: 120, endSec: 180 },
      recap: { startSec: 5, endSec: 110 },
      outro: { startSec: 2800, endSec: 2950 },
    };

    const result = resolvePlaybackPromptSegments(chapters, introDbSegments);

    expect(result.intro).toEqual({ start: 120, skipTo: 180 });
    expect(result.recap).toEqual({ start: 5, skipTo: 110 });
    expect(result.outro).toEqual({ start: 2800 });
  });

  it('returns all nulls when neither chapters nor IntroDB segments exist', () => {
    expect(resolvePlaybackPromptSegments([])).toEqual({
      intro: null,
      recap: null,
      outro: null,
    });

    expect(resolvePlaybackPromptSegments([], null)).toEqual({
      intro: null,
      recap: null,
      outro: null,
    });

    expect(resolvePlaybackPromptSegments([], { intro: null, recap: null, outro: null })).toEqual({
      intro: null,
      recap: null,
      outro: null,
    });
  });

  it('handles partial IntroDB segments gracefully', () => {
    const result = resolvePlaybackPromptSegments([], {
      intro: { startSec: 60, endSec: 120 },
      recap: null,
      outro: null,
    });

    expect(result.intro).toEqual({ start: 60, skipTo: 120 });
    expect(result.recap).toBeNull();
    expect(result.outro).toBeNull();
  });
});
