import type { MpvChapter } from '../store/usePlayerStore';
import type { IntroDbSegments } from '../data/introDbClient';

const INTRO_PATTERN = /^(op(ening)?|intro(duction)?|title\s*sequence)\b/i;
const OUTRO_PATTERN = /^(ed(ing)?|outro|ending|end\s*credits?|credits?)\b/i;

interface PlaybackSegmentRange {
  start: number;
  skipTo: number;
}

export interface PlaybackPromptSegments {
  intro: PlaybackSegmentRange | null;
  recap: PlaybackSegmentRange | null;
  outro: { start: number } | null;
}

/**
 * The intro chapter, if the file has one, and where to land after it. Needs
 * a *following* chapter to know where the intro ends — a title alone only
 * marks where it starts, not how long it runs.
 */
export function findIntroChapter(chapters: MpvChapter[]): { start: number; skipTo: number } | null {
  const index = chapters.findIndex((c) => c.title && INTRO_PATTERN.test(c.title.trim()));
  if (index === -1) return null;
  const next = chapters[index + 1];
  if (!next) return null;
  return { start: chapters[index]!.time, skipTo: next.time };
}

/**
 * The outro/credits chapter, if the file has one — used to show the "Next
 * Episode" prompt exactly when the credits start instead of guessing from a
 * fixed time offset.
 */
export function findOutroChapter(chapters: MpvChapter[]): { start: number } | null {
  const match = [...chapters].reverse().find((c) => c.title && OUTRO_PATTERN.test(c.title.trim()));
  return match ? { start: match.time } : null;
}

/**
 * Merges embedded chapter markers with crowdsourced IntroDB segment timestamps.
 * Embedded chapters always take precedence over IntroDB segments.
 */
export function resolvePlaybackPromptSegments(
  chapters: MpvChapter[],
  introDbSegments?: IntroDbSegments | null,
): PlaybackPromptSegments {
  const chapterIntro = findIntroChapter(chapters);
  const chapterOutro = findOutroChapter(chapters);

  const intro: PlaybackSegmentRange | null =
    chapterIntro ??
    (introDbSegments?.intro
      ? { start: introDbSegments.intro.startSec, skipTo: introDbSegments.intro.endSec }
      : null);

  const recap: PlaybackSegmentRange | null = introDbSegments?.recap
    ? { start: introDbSegments.recap.startSec, skipTo: introDbSegments.recap.endSec }
    : null;

  const outro: { start: number } | null =
    chapterOutro ?? (introDbSegments?.outro ? { start: introDbSegments.outro.startSec } : null);

  return { intro, recap, outro };
}
