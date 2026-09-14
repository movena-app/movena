import { describe, expect, it } from 'vitest';
import {
  fitHudGeometry,
  HUD_VIEWPORT_MARGIN,
  initialHudGeometry,
} from '@/modules/diagnostics/components/debugOverlayGeometry';

describe('debug overlay geometry', () => {
  it('centers the default HUD in a large viewport', () => {
    expect(initialHudGeometry({ width: 1200, height: 900 })).toEqual({
      x: 260,
      y: 190,
      width: 680,
      height: 520,
    });
  });

  it('fits dimensions and position inside small viewports', () => {
    expect(
      fitHudGeometry({ x: -100, y: 900, width: 800, height: 900 }, { width: 420, height: 300 }),
    ).toEqual({
      x: HUD_VIEWPORT_MARGIN,
      y: HUD_VIEWPORT_MARGIN,
      width: 396,
      height: 276,
    });
  });

  it('keeps resized geometry inside the right and bottom margins', () => {
    expect(
      fitHudGeometry({ x: 900, y: 700, width: 500, height: 400 }, { width: 1000, height: 800 }),
    ).toEqual({ x: 488, y: 388, width: 500, height: 400 });
  });
});
