import { tauriApi, type MpvPropertyUpdate } from '@/platform/tauri';

export interface ImageAdjustments {
  imageSharpness: number; // 0-100, 0 = off
  imageBrightness: number; // 0-200%, 100 = neutral
  imageContrast: number; // -100..100, 0 = neutral
  imageSaturation: number; // -100..100, 0 = neutral
  imageHue: number; // -100..100, 0 = neutral
  imageGamma: number; // -100..100, 0 = neutral ("Dark scene")
}

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  imageSharpness: 0,
  imageBrightness: 100,
  imageContrast: 0,
  imageSaturation: 0,
  imageHue: 0,
  imageGamma: 0,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The mpv `set` command(s) that realize one adjustment.
 *
 * Brightness/contrast/saturation/hue/gamma are mpv's own video-equalizer
 * properties (-100..100, 0 neutral); brightness is kept as a 0-200% value in
 * the UI, the same convention other players use, and shifted back to mpv's
 * range here.
 *
 * Sharpness has no equivalent under `--vo=gpu-next`: mpv's `--sharpen` only
 * works with the legacy `--vo=gpu`. The closest native knob under gpu-next is
 * the scaler's blur kernel — mpv's manual describes decreasing `scale-blur`
 * as sharpening the image, so the slider pushes it below its neutral point
 * instead of a dedicated sharpen amount. Kept mild (down to -0.9) since the
 * manual also warns that low values introduce ringing.
 */
function mpvPropertiesFor(
  key: keyof ImageAdjustments,
  values: ImageAdjustments,
): MpvPropertyUpdate[] {
  switch (key) {
    case 'imageBrightness':
      return [
        {
          property: 'brightness',
          value: Math.round(clamp(values.imageBrightness - 100, -100, 100)),
        },
      ];
    case 'imageContrast':
      return [{ property: 'contrast', value: Math.round(clamp(values.imageContrast, -100, 100)) }];
    case 'imageSaturation':
      return [
        { property: 'saturation', value: Math.round(clamp(values.imageSaturation, -100, 100)) },
      ];
    case 'imageHue':
      return [{ property: 'hue', value: Math.round(clamp(values.imageHue, -100, 100)) }];
    case 'imageGamma':
      return [{ property: 'gamma', value: Math.round(clamp(values.imageGamma, -100, 100)) }];
    case 'imageSharpness': {
      const scaleBlur = (clamp(values.imageSharpness, 0, 100) / 100) * -0.9;
      return [
        { property: 'scale-blur', value: Number(scaleBlur.toFixed(3)) },
        { property: 'cscale-blur', value: Number(scaleBlur.toFixed(3)) },
      ];
    }
  }
}

/**
 * Apply a single adjustment to the running mpv instance.
 *
 * Deliberately scoped to just the one property that changed rather than
 * resending the whole set: `scale-blur`/`cscale-blur` make libplacebo
 * recompile its scaler, which is what produced a visible flash on every
 * slider tick when dragging *any* of the sliders resent it unchanged along
 * with everything else. Safe to call with no player running.
 */
export async function applyImageAdjustment(
  key: keyof ImageAdjustments,
  values: ImageAdjustments,
  throwOnError = false,
): Promise<void> {
  for (const update of mpvPropertiesFor(key, values)) {
    try {
      await tauriApi.mpvSetProperty(update);
    } catch (error: unknown) {
      if (throwOnError) throw error;
      /* Settings may change with no player running; the next session reapplies them. */
    }
  }
}

/**
 * Apply every adjustment to the running mpv instance.
 *
 * Used where there is no "one changed value" — a fresh stream start or a
 * full reset — so, like `applyAspectRatio`, every property is sent rather
 * than diffed against whatever mpv already has.
 */
export async function applyImageAdjustments(
  values: ImageAdjustments,
  throwOnError = false,
): Promise<void> {
  const keys: Array<keyof ImageAdjustments> = [
    'imageBrightness',
    'imageContrast',
    'imageSaturation',
    'imageHue',
    'imageGamma',
    'imageSharpness',
  ];
  for (const key of keys) {
    await applyImageAdjustment(key, values, throwOnError);
  }
}
