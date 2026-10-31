// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeSeason,
  applyAppearanceTheme,
  msUntilNextLocalMidnight,
} from '@/shared/design/appearance';
import { contrastRatio } from '@/shared/design/color';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('appearance synchronization', () => {
  it('applies the requested root theme and raw accent tokens', () => {
    applyAppearanceTheme('light', '#ffcc00');

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(root.style.getPropertyValue('--accent-color')).toBe('#ffcc00');
    expect(root.style.getPropertyValue('--accent-color-rgb')).toBe('255, 204, 0');
    expect(root.style.getPropertyValue('--text-on-accent')).toBe('#0f1014');
    expect(
      contrastRatio(root.style.getPropertyValue('--accent-foreground'), '#ffffff'),
    ).toBeGreaterThanOrEqual(5.5);
  });

  it('falls back safely when an invalid accent reaches the DOM boundary', () => {
    applyAppearanceTheme('dark', 'invalid');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent-color')).toBe('#0672e5');
  });

  it('layers the Christmas season over the dark theme with its own accent', () => {
    applyAppearanceTheme('dark', '#ffcc00', 'christmas');

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.season).toBe('christmas');
    expect(root.style.getPropertyValue('--accent-color')).toBe('#d93a49');
    expect(root.style.getPropertyValue('--accent-color-rgb')).toBe('217, 58, 73');
    expect(root.style.getPropertyValue('--text-on-accent')).toBe('#ffffff');
  });

  it('keeps the light theme and saved accent untouched during a season', () => {
    applyAppearanceTheme('light', '#ffcc00', 'christmas');

    const root = document.documentElement;
    expect(root.dataset.season).toBeUndefined();
    expect(root.style.getPropertyValue('--accent-color')).toBe('#ffcc00');
  });

  it('restores the saved accent when a season ends', () => {
    applyAppearanceTheme('dark', '#af52de', 'christmas');
    applyAppearanceTheme('dark', '#af52de', null);

    const root = document.documentElement;
    expect(root.dataset.season).toBeUndefined();
    expect(root.style.getPropertyValue('--accent-color')).toBe('#af52de');
  });
});

describe('seasonal calendar', () => {
  it('runs Christmas from December 1 through January 6 in local time', () => {
    expect(activeSeason(new Date(2026, 10, 30, 23, 59, 59))).toBeNull();
    expect(activeSeason(new Date(2026, 11, 1, 0, 0, 0))).toBe('christmas');
    expect(activeSeason(new Date(2026, 11, 31, 23, 59, 59))).toBe('christmas');
    expect(activeSeason(new Date(2027, 0, 1))).toBe('christmas');
    expect(activeSeason(new Date(2027, 0, 6, 23, 59, 59))).toBe('christmas');
    expect(activeSeason(new Date(2027, 0, 7, 0, 0, 0))).toBeNull();
    expect(activeSeason(new Date(2026, 6, 15))).toBeNull();
    expect(activeSeason(new Date(Number.NaN))).toBeNull();
  });

  it('measures the delay to the next local midnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 10, 30, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextLocalMidnight(new Date(2026, 11, 31, 0, 0, 0))).toBe(
      new Date(2027, 0, 1).getTime() - new Date(2026, 11, 31).getTime(),
    );
  });
});
