import { describe, expect, it } from 'vitest';
import { calculateGridLayout } from '@/modules/catalog/lib/gridLayout';

describe('responsive grid layout', () => {
  it('uses the full standard-grid width without horizontal overflow or slack', () => {
    const width = 1189;
    const gap = 16;
    const layout = calculateGridLayout(width, gap, false);

    expect(layout.columns).toBe(6);
    expect(layout.cardWidth * layout.columns + gap * (layout.columns - 1)).toBeCloseTo(width);
    expect(layout.rowHeight).toBeCloseTo(layout.cardWidth * 1.5);
  });

  it('keeps standard posters readable near a column breakpoint', () => {
    const layout = calculateGridLayout(480, 16, false);

    expect(layout.columns).toBe(2);
    expect(layout.cardWidth).toBe(232);
  });

  it('derives square Live TV rows from the same exact card width', () => {
    const width = 700;
    const gap = 16;
    const layout = calculateGridLayout(width, gap, true);

    expect(layout.cardWidth * layout.columns + gap * (layout.columns - 1)).toBeCloseTo(width);
    expect(layout.rowHeight).toBe(layout.cardWidth);
  });
});
