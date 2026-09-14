import type { ChangeEvent, CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { RiEqualizer3Fill, RiEqualizer3Line } from '@/shared/ui/icons';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { StateIcon } from '@/shared/ui/StateIcon';
import {
  applyImageAdjustment,
  applyImageAdjustments,
  DEFAULT_IMAGE_ADJUSTMENTS,
  type ImageAdjustments,
} from './imageSettings';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './PlayerControls.module.css';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';

/* Native `title` tooltips are avoided in the player overlay — see the note in
   SharedControls.tsx. `aria-label` keeps controls described without them. */

interface SliderDef {
  key: keyof ImageAdjustments;
  label: string;
  min: number;
  max: number;
  format: (value: number) => string;
}

const SLIDERS: SliderDef[] = [
  {
    key: 'imageSharpness',
    label: 'Sharpness',
    min: 0,
    max: 100,
    format: (v) => (v === 0 ? 'Off' : String(Math.round(v))),
  },
  {
    key: 'imageBrightness',
    label: 'Brightness',
    min: 0,
    max: 200,
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: 'imageContrast',
    label: 'Contrast',
    min: -100,
    max: 100,
    format: (v) => String(Math.round(v)),
  },
  {
    key: 'imageSaturation',
    label: 'Saturation',
    min: -100,
    max: 100,
    format: (v) => String(Math.round(v)),
  },
  { key: 'imageHue', label: 'Hue', min: -100, max: 100, format: (v) => String(Math.round(v)) },
  {
    key: 'imageGamma',
    label: 'Dark scene (gamma)',
    min: -100,
    max: 100,
    format: (v) => String(Math.round(v)),
  },
];

const isAtDefaults = (values: ImageAdjustments) =>
  SLIDERS.every((slider) => values[slider.key] === DEFAULT_IMAGE_ADJUSTMENTS[slider.key]);

/** How often a slider may push a value to mpv while it's being dragged.
 * `scale-blur`/`cscale-blur` (the Sharpness knob) make libplacebo recompile
 * its scaler on every `set`, which visibly flashed the picture when a fast
 * drag fired dozens of them a second — this caps it to something the
 * renderer can keep up with while still tracking the drag closely. */
const APPLY_THROTTLE_MS = 80;

interface ThrottleEntry {
  timer: ReturnType<typeof setTimeout> | null;
  lastRunAt: number;
}

/**
 * Picture adjustments popover — sharpness, brightness, contrast, saturation,
 * hue and a dark-scene gamma lift, each bound straight to an mpv property
 * (see imageSettings.ts). Persisted like AspectRatioControl: the choice
 * carries across streams until changed, and is re-applied on every stream
 * start since each one gets a fresh mpv instance.
 */
export function ImageControls() {
  const { t } = useI18n();
  const activePopover = usePlayerStore((s) => s.activePopover);
  const setActivePopover = usePlayerStore((s) => s.setActivePopover);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const imageSharpness = useSettingsStore((s) => s.imageSharpness);
  const imageBrightness = useSettingsStore((s) => s.imageBrightness);
  const imageContrast = useSettingsStore((s) => s.imageContrast);
  const imageSaturation = useSettingsStore((s) => s.imageSaturation);
  const imageHue = useSettingsStore((s) => s.imageHue);
  const imageGamma = useSettingsStore((s) => s.imageGamma);
  const values: ImageAdjustments = {
    imageSharpness,
    imageBrightness,
    imageContrast,
    imageSaturation,
    imageHue,
    imageGamma,
  };

  const isOpen = activePopover === 'image';
  const isModified = !isAtDefaults(values);

  // Per-slider throttle state, so dragging one doesn't hold back another.
  const throttleRef = useRef<Partial<Record<keyof ImageAdjustments, ThrottleEntry>>>({});
  const pendingRef = useRef<Partial<Record<keyof ImageAdjustments, ImageAdjustments>>>({});

  useEffect(
    () => () => {
      for (const entry of Object.values(throttleRef.current)) {
        if (entry?.timer !== null && entry?.timer !== undefined) clearTimeout(entry.timer);
      }
    },
    [],
  );

  const scheduleApply = (key: keyof ImageAdjustments, next: ImageAdjustments) => {
    pendingRef.current[key] = next;
    const entry = throttleRef.current[key] ?? { timer: null, lastRunAt: 0 };
    throttleRef.current[key] = entry;
    if (entry.timer !== null) return; // a flush for this slider is already scheduled

    const delay = Math.max(0, APPLY_THROTTLE_MS - (Date.now() - entry.lastRunAt));
    entry.timer = setTimeout(() => {
      entry.timer = null;
      entry.lastRunAt = Date.now();
      const latest = pendingRef.current[key];
      if (latest)
        void applyImageAdjustment(key, latest, true).catch((error: unknown) => {
          notify.error(
            'Image Adjustment Failed',
            getErrorMessage(error, `Could not apply ${key}.`),
            undefined,
            undefined,
            'playback',
          );
        });
    }, delay);
  };

  const handleChange = (key: keyof ImageAdjustments) => (event: ChangeEvent<HTMLInputElement>) => {
    const next = { ...values, [key]: Number(event.target.value) };
    updateSetting(key, next[key]);
    scheduleApply(key, next);
  };

  const handleReset = () => {
    for (const entry of Object.values(throttleRef.current)) {
      if (entry?.timer !== null && entry?.timer !== undefined) clearTimeout(entry.timer);
      if (entry) entry.timer = null;
    }
    pendingRef.current = {};
    for (const slider of SLIDERS) {
      updateSetting(slider.key, DEFAULT_IMAGE_ADJUSTMENTS[slider.key]);
    }
    void applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, true).catch((error: unknown) => {
      notify.error(
        'Image Reset Failed',
        getErrorMessage(error, 'Could not reset the image adjustments.'),
        undefined,
        undefined,
        'playback',
      );
    });
  };

  return (
    <div className={styles.popoverContainer} data-popover>
      <button
        type="button"
        className={`${styles.iconBtn} ${isModified ? styles.activeIcon : ''}`}
        onClick={() => setActivePopover(isOpen ? null : 'image')}
        aria-label={t('Image Adjustments')}
      >
        <StateIcon
          icons={{ line: RiEqualizer3Line, fill: RiEqualizer3Fill }}
          active={isModified}
          size={20}
        />
      </button>

      {isOpen && (
        <div className={`${styles.popoverMenu} ${styles.imagePanel} subtle-scrollbar`}>
          <div className={styles.imagePanelHeader}>
            <span className={styles.popoverTitle} style={{ padding: 0, margin: 0 }}>
              {t('Image')}
            </span>
            <button
              type="button"
              className={styles.imageResetBtn}
              onClick={handleReset}
              disabled={!isModified}
              aria-label={t('Reset image adjustments')}
            >
              <RotateCcw size={13} />
              {t('Reset')}
            </button>
          </div>

          {SLIDERS.map((slider) => {
            const value = values[slider.key];
            const progress = ((value - slider.min) / (slider.max - slider.min)) * 100;
            return (
              <div className={styles.imageRow} key={slider.key}>
                <div className={styles.imageRowHeader}>
                  <span>{t(slider.label)}</span>
                  <span className={styles.imageRowValue}>{t(slider.format(value))}</span>
                </div>
                <input
                  type="range"
                  className={styles.imageSlider}
                  min={slider.min}
                  max={slider.max}
                  step={1}
                  value={value}
                  onChange={handleChange(slider.key)}
                  style={{ '--progress': `${progress}%` } as CSSProperties}
                  aria-label={t(slider.label)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
