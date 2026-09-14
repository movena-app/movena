import { translateUiText, type UiLanguage } from '../i18n/i18n';

export interface HistoryCardItem {
  type?: string | undefined;
  seasonNum?: string | number | undefined;
  episodeNum?: string | number | undefined;
  currentTime?: number | undefined;
  duration?: number | undefined;
}

/** `1:23:45` for anything past an hour, `23:45` below it. */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Human-readable runtime for API values such as `00:48:23`. */
export function formatDurationLabel(duration?: string, durationSeconds?: number): string | null {
  let totalSeconds = durationSeconds;

  if ((!totalSeconds || !isFinite(totalSeconds)) && duration) {
    const parts = duration.trim().split(':').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      totalSeconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    } else if (parts.length === 2 && parts.every(Number.isFinite)) {
      totalSeconds = parts[0]! * 60 + parts[1]!;
    } else {
      return duration.trim() || null;
    }
  }

  if (!totalSeconds || !isFinite(totalSeconds) || totalSeconds <= 0) return null;

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${totalMinutes} min`;
}

/**
 * How much is left, in words — "24 min left", "1 h 12 min left".
 *
 * Preferred over a percentage on resume affordances: "45%" says nothing about
 * whether that is ten minutes or an hour, which is the thing you actually want
 * to know before pressing play.
 */
export function formatRemaining(
  currentTime?: number,
  duration?: number,
  language: UiLanguage = 'en',
): string | null {
  if (!duration || !isFinite(duration) || duration <= 0) return null;
  const remaining = duration - (currentTime ?? 0);
  if (!isFinite(remaining) || remaining <= 0) return null;

  const totalMinutes = Math.max(1, Math.round(remaining / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const durationLabel = hours > 0 ? `${hours} h ${minutes} min` : `${totalMinutes} min`;
  return translateUiText('{duration} left', language, { duration: durationLabel });
}

/**
 * The compact Continue Watching metadata — "S1 E1 · 24 min left" for
 * a series, just the remaining time for a movie. Shared by every place that
 * renders history entries as cards so they can't drift apart again.
 */
export function historyCardSubtitle<T extends HistoryCardItem>(
  item: T,
  language: UiLanguage = 'en',
): string | undefined {
  return (
    [
      item.type === 'series' && item.seasonNum && item.episodeNum
        ? `S${item.seasonNum} E${item.episodeNum}`
        : null,
      formatRemaining(item.currentTime, item.duration, language),
    ]
      .filter(Boolean)
      .join(' · ') || undefined
  );
}
