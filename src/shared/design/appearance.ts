import {
  accessibleAccentForeground,
  accentHoverColor,
  contrastingTextColor,
  DEFAULT_ACCENT_COLOR,
  parseHex,
} from './color';

export type ThemePreference = 'dark' | 'light';
export type Season = 'christmas' | 'easter';

/** Seasons bring their own accent; the saved accent returns once they end. */
const SEASON_ACCENT_COLORS: Record<Season, string> = {
  christmas: '#d93a49',
  easter: '#8f6fe0',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Western (Gregorian) Easter Sunday for a year, as a local date. */
export function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Season active on the user's local calendar date, so seasons ship with the
 * app instead of needing a release timed to the holidays. Christmas runs from
 * December 1 through Epiphany on January 6; Easter from Palm Sunday through
 * Easter Monday.
 */
export function activeSeason(now: Date): Season | null {
  const month = now.getMonth();
  if (month === 11 || (month === 0 && now.getDate() <= 6)) return 'christmas';

  const year = now.getFullYear();
  if (Number.isNaN(year)) return null;
  const today = new Date(year, month, now.getDate()).getTime();
  const easter = easterSunday(year).getTime();
  // Rounded: a daylight-saving change inside the window makes one day 23 or 25 hours.
  const daysFromEaster = Math.round((today - easter) / DAY_MS);
  if (daysFromEaster >= -7 && daysFromEaster <= 1) return 'easter';
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
