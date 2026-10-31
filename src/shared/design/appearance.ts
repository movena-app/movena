import {
  accessibleAccentForeground,
  accentHoverColor,
  contrastingTextColor,
  DEFAULT_ACCENT_COLOR,
  parseHex,
} from './color';

export type ThemePreference = 'dark' | 'light';
export type Season = 'christmas';

/** Seasons bring their own accent; the saved accent returns once they end. */
const SEASON_ACCENT_COLORS: Record<Season, string> = {
  christmas: '#d93a49',
};

/**
 * Season active on the user's local calendar date. Christmas runs from
 * December 1 through Epiphany on January 6, so it ships with the app instead
 * of needing a release timed to the holidays.
 */
export function activeSeason(now: Date): Season | null {
  const month = now.getMonth();
  if (month === 11 || (month === 0 && now.getDate() <= 6)) return 'christmas';
  return null;
}

/** Milliseconds until the next local midnight, when the season may change. */
export function msUntilNextLocalMidnight(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

/**
 * Applies the complete appearance contract to the root element. Keeping this
 * outside React lets startup restore a saved light theme before the first
 * frame while App can reuse the same path for live setting changes.
 */
export function applyAppearanceTheme(
  theme: ThemePreference,
  accentValue: string,
  season: Season | null = null,
  root: HTMLElement = document.documentElement,
): void {
  // Seasonal palettes are drawn for the dark canvas only.
  const appliedSeason = theme === 'dark' ? season : null;
  const requestedAccent = appliedSeason ? SEASON_ACCENT_COLORS[appliedSeason] : accentValue;
  const accent = parseHex(requestedAccent) ? requestedAccent : DEFAULT_ACCENT_COLOR;
  const rgb = parseHex(accent);

  root.dataset.theme = theme;
  if (appliedSeason) root.dataset.season = appliedSeason;
  else delete root.dataset.season;
  root.style.colorScheme = theme;
  root.style.setProperty('--accent-color', accent);
  root.style.setProperty('--accent-foreground', accessibleAccentForeground(accent, theme));
  root.style.setProperty('--accent-hover', accentHoverColor(accent, theme));
  root.style.setProperty('--text-on-accent', contrastingTextColor(accent));

  if (rgb) {
    root.style.setProperty('--accent-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }
}
