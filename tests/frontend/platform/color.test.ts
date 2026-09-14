import { describe, expect, it } from 'vitest';
import {
  accessibleAccentForeground,
  accentHoverColor,
  contrastRatio,
  contrastingTextColor,
  DARK_CONTRAST_TEXT,
  isLightColor,
  LIGHT_CONTRAST_TEXT,
  relativeLuminance,
} from '@/shared/design/color';

describe('color contrast helpers', () => {
  it('uses dark text for bright and mid-luminance accents', () => {
    expect(contrastingTextColor('#ff9500')).toBe(DARK_CONTRAST_TEXT);
    expect(contrastingTextColor('#64d2ff')).toBe(DARK_CONTRAST_TEXT);
    expect(isLightColor('#34c759')).toBe(true);
  });

  it('uses light text for dark accents', () => {
    expect(contrastingTextColor('#0672e5')).toBe(LIGHT_CONTRAST_TEXT);
    expect(isLightColor('#31104a')).toBe(false);
  });

  it('returns null luminance for invalid colors', () => {
    expect(relativeLuminance('not-a-color')).toBeNull();
  });

  it('moves hover accents toward the active theme contrast direction', () => {
    expect(relativeLuminance(accentHoverColor('#0672e5', 'dark'))!).toBeGreaterThan(
      relativeLuminance('#0672e5')!,
    );
    expect(relativeLuminance(accentHoverColor('#ffcc00', 'light'))!).toBeLessThan(
      relativeLuminance('#ffcc00')!,
    );
    expect(accentHoverColor('not-a-color')).toBe('not-a-color');
  });

  it('lifts arbitrary dark accents into an accessible text foreground', () => {
    for (const accent of ['#0672e5', '#31104a', '#000000', '#ff9500']) {
      const foreground = accessibleAccentForeground(accent);
      expect(contrastRatio(foreground, '#1b222d')).toBeGreaterThanOrEqual(5.5);
    }
  });

  it('darkens arbitrary bright accents for accessible light-theme text', () => {
    for (const accent of ['#0672e5', '#64d2ff', '#ffcc00', '#ffffff']) {
      const foreground = accessibleAccentForeground(accent, 'light');
      expect(contrastRatio(foreground, '#ffffff')).toBeGreaterThanOrEqual(5.5);
    }
  });
});
