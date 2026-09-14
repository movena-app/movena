// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { applyAppearanceTheme } from '@/shared/design/appearance';
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
});
