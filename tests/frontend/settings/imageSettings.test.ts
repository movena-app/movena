import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mpvSetProperty } = vi.hoisted(() => ({
  mpvSetProperty: vi.fn(),
}));

vi.mock('@/platform/tauri', () => ({
  tauriApi: { mpvSetProperty },
}));

import {
  applyImageAdjustment,
  applyImageAdjustments,
  DEFAULT_IMAGE_ADJUSTMENTS,
} from '@/modules/playback/components/imageSettings';

beforeEach(() => {
  mpvSetProperty.mockReset().mockResolvedValue(undefined);
});

describe('applyImageAdjustments', () => {
  it('sends every mpv equalizer property at neutral defaults', async () => {
    await applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS);

    expect(mpvSetProperty.mock.calls).toEqual([
      [{ property: 'brightness', value: 0 }],
      [{ property: 'contrast', value: 0 }],
      [{ property: 'saturation', value: 0 }],
      [{ property: 'hue', value: 0 }],
      [{ property: 'gamma', value: 0 }],
      [{ property: 'scale-blur', value: 0 }],
      [{ property: 'cscale-blur', value: 0 }],
    ]);
  });

  it("shifts the 0-200% brightness value back to mpv's -100..100 range", async () => {
    await applyImageAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS, imageBrightness: 150 });
    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'brightness', value: 50 });
  });

  it('maps full sharpness to the negative scale-blur ceiling', async () => {
    await applyImageAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS, imageSharpness: 100 });
    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'scale-blur', value: -0.9 });
    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'cscale-blur', value: -0.9 });
  });

  it('clamps out-of-range values instead of forwarding them to mpv', async () => {
    await applyImageAdjustments({
      imageSharpness: 500,
      imageBrightness: -50,
      imageContrast: 999,
      imageSaturation: -999,
      imageHue: 0,
      imageGamma: 0,
    });

    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'brightness', value: -100 });
    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'contrast', value: 100 });
    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'saturation', value: -100 });
    expect(mpvSetProperty).toHaveBeenCalledWith({ property: 'scale-blur', value: -0.9 });
  });

  it('continues applying independent properties after one rejection', async () => {
    mpvSetProperty.mockRejectedValueOnce(new Error('not running')).mockResolvedValue(undefined);
    await expect(applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS)).resolves.toBeUndefined();
    expect(mpvSetProperty).toHaveBeenCalledTimes(7);
  });

  it('preserves the native image command error for active-player callers', async () => {
    mpvSetProperty.mockRejectedValueOnce(new Error('mpv rejected brightness'));
    await expect(applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, true)).rejects.toThrow(
      'mpv rejected brightness',
    );
  });
});

describe('applyImageAdjustment', () => {
  it('touches only the changed property, leaving the scaler kernel untouched', async () => {
    await applyImageAdjustment('imageContrast', {
      ...DEFAULT_IMAGE_ADJUSTMENTS,
      imageContrast: 40,
    });

    // Regression guard: an earlier version resent the whole batch on every
    // slider tick, including `scale-blur`/`cscale-blur` — which makes
    // libplacebo recompile its scaler and visibly flashed the picture on
    // every drag step, even when dragging an unrelated slider like this one.
    expect(mpvSetProperty.mock.calls).toEqual([[{ property: 'contrast', value: 40 }]]);
  });

  it('only reaches the scaler kernel when sharpness itself changes', async () => {
    await applyImageAdjustment('imageSharpness', {
      ...DEFAULT_IMAGE_ADJUSTMENTS,
      imageSharpness: 50,
    });

    expect(mpvSetProperty.mock.calls).toEqual([
      [{ property: 'scale-blur', value: -0.45 }],
      [{ property: 'cscale-blur', value: -0.45 }],
    ]);
  });
});
