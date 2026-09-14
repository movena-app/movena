import {
  accessibleAccentForeground,
  accentHoverColor,
  contrastingTextColor,
  DEFAULT_ACCENT_COLOR,
  parseHex,
} from './color';

export type ThemePreference = 'dark' | 'light';

/**
 * Applies the complete appearance contract to the root element. Keeping this
 * outside React lets startup restore a saved light theme before the first
 * frame while App can reuse the same path for live setting changes.
 */
export function applyAppearanceTheme(
  theme: ThemePreference,
  accentValue: string,
  root: HTMLElement = document.documentElement,
): void {
  const accent = parseHex(accentValue) ? accentValue : DEFAULT_ACCENT_COLOR;
  const rgb = parseHex(accent);

  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.setProperty('--accent-color', accent);
  root.style.setProperty('--accent-foreground', accessibleAccentForeground(accent, theme));
  root.style.setProperty('--accent-hover', accentHoverColor(accent, theme));
  root.style.setProperty('--text-on-accent', contrastingTextColor(accent));

  if (rgb) {
    root.style.setProperty('--accent-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }
}
