export interface Hsl {
  h: number; // 0–360
  s: number; // 0–100
  l: number; // 0–100
}

export const DEFAULT_ACCENT_COLOR = '#0672e5';
export const DARK_CONTRAST_TEXT = '#0f1014';
export const LIGHT_CONTRAST_TEXT = '#ffffff';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** `#abc` and `#aabbcc` both accepted; anything else returns null. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace(/^#/, '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function isValidHex(hex: string): boolean {
  return parseHex(hex) !== null;
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/**
 * Relative luminance per WCAG, used to decide whether a swatch needs a dark or
 * light glyph on top of it. A fixed white check disappears on yellow.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(foreground: string, background: string): number | null {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Retains the selected accent hue while lifting a dark custom value enough to
 * remain legible as small text on Movena's deepest elevated surface. The 5.5
 * target leaves headroom for the accent-tinted selection surface.
 */
export function accessibleAccentForeground(hex: string, theme: 'dark' | 'light' = 'dark'): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return DEFAULT_ACCENT_COLOR;
  const background = theme === 'light' ? '#ffffff' : '#1b222d';
  const boundary = theme === 'light' ? 0 : 96;
  const step = theme === 'light' ? -1 : 1;
  for (
    let lightness = hsl.l;
    theme === 'light' ? lightness >= boundary : lightness <= boundary;
    lightness += step
  ) {
    const candidate = hslToHex({ ...hsl, l: lightness });
    if ((contrastRatio(candidate, background) ?? 0) >= 5.5) return candidate;
  }
  return theme === 'light' ? DARK_CONTRAST_TEXT : LIGHT_CONTRAST_TEXT;
}

export function isLightColor(hex: string): boolean {
  const luminance = relativeLuminance(hex);
  const darkLuminance = relativeLuminance(DARK_CONTRAST_TEXT);
  if (luminance === null || darkLuminance === null) return false;
  const darkTextContrast = (luminance + 0.05) / (darkLuminance + 0.05);
  const lightTextContrast = 1.05 / (luminance + 0.05);
  return darkTextContrast > lightTextContrast;
}

export function contrastingTextColor(hex: string): string {
  return isLightColor(hex) ? DARK_CONTRAST_TEXT : LIGHT_CONTRAST_TEXT;
}

/**
 * Produces a perceptible hover tone without assuming every custom accent is
 * dark. Bright accents move toward black; dark accents move toward white.
 */
export function accentHoverColor(hex: string, theme: 'dark' | 'light' = 'dark'): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;

  return hslToHex({
    ...hsl,
    l: hsl.l + (theme === 'light' ? -8 : 8),
  });
}
