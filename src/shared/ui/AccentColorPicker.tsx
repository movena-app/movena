import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pipette } from 'lucide-react';
import {
  DEFAULT_ACCENT_COLOR,
  hexToHsl,
  hslToHex,
  isLightColor,
  isValidHex,
} from '../design/color';
import styles from './AccentColorPicker.module.css';
import { useI18n } from '../i18n/i18n';

/**
 * Preset accents.
 *
 * Literal values rather than design tokens, deliberately: this is a stored user
 * preference, and what gets written into `--accent-color` at runtime cannot
 * itself be a token reference. They mirror the system hues the design system
 * lists, so the row stays in the same family as the rest of the interface.
 */
const ACCENT_PRESETS = [
  { name: 'Electric Blue', hex: DEFAULT_ACCENT_COLOR },
  { name: 'Vibrant Purple', hex: '#af52de' },
  { name: 'Emerald Green', hex: '#34c759' },
  { name: 'Sunset Orange', hex: '#ff9500' },
  { name: 'Crimson Red', hex: '#ff3b30' },
  { name: 'Hot Pink', hex: '#ff2d55' },
  { name: 'Cyan Blue', hex: '#64d2ff' },
];

interface AccentColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const { t, number } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [hexDraft, setHexDraft] = useState(value);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isPreset = ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === value.toLowerCase());
  const hsl = hexToHsl(value) ?? { h: 211, s: 100, l: 50 };

  const setChannel = (channel: 'h' | 's' | 'l', amount: number) => {
    const next = hslToHex({ ...hsl, [channel]: amount });
    onChange(next);
    setHexDraft(next);
  };

  // Follow changes made elsewhere (a preset click, a reset) while open.
  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 248;
    setPosition({
      top: rect.bottom + 8,
      // Keep it on screen when the trigger sits near the right edge.
      left: Math.min(rect.left, window.innerWidth - width - 16),
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const glyphClass = isLightColor(value) ? styles.glyphOnLight : styles.glyphOnDark;

  return (
    <div className={styles.group}>
      {ACCENT_PRESETS.map((preset) => {
        const isSelected = value.toLowerCase() === preset.hex.toLowerCase();
        return (
          <button
            key={preset.hex}
            type="button"
            className={`${styles.swatch} ${isSelected ? styles.active : ''}`}
            style={{ backgroundColor: preset.hex }}
            onClick={() => onChange(preset.hex)}
            title={t(preset.name)}
            aria-label={t(preset.name)}
            aria-pressed={isSelected}
          >
            {isSelected && (
              <Check
                size={14}
                strokeWidth={3}
                className={isLightColor(preset.hex) ? styles.glyphOnLight : styles.glyphOnDark}
              />
            )}
          </button>
        );
      })}

      <button
        ref={triggerRef}
        type="button"
        className={`${styles.customTrigger} ${!isPreset ? styles.customTriggerSet : ''} ${
          !isPreset ? styles.active : ''
        }`}
        style={!isPreset ? { backgroundColor: value } : undefined}
        onClick={() => setIsOpen((open) => !open)}
        title={
          isPreset ? t('Custom color') : t('Custom color ({value})', { value: value.toUpperCase() })
        }
        aria-label={t('Choose a custom accent color')}
        aria-expanded={isOpen}
      >
        {isPreset ? (
          <Pipette size={13} strokeWidth={2.5} />
        ) : (
          <Check size={14} strokeWidth={3} className={glyphClass} />
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.popover}
            style={{ top: position.top, left: position.left }}
          >
            <div className={styles.preview}>
              <div className={styles.previewSwatch} style={{ backgroundColor: value }} />
              <input
                className={`uiField ${styles.hexField} ${isValidHex(hexDraft) ? '' : styles.hexFieldInvalid}`}
                value={hexDraft}
                spellCheck={false}
                aria-label={t('Hex color value')}
                onChange={(event) => {
                  const next = event.target.value;
                  setHexDraft(next);
                  // Only commit once it parses, so half-typed values do not
                  // repaint the whole interface on every keystroke.
                  if (isValidHex(next)) {
                    onChange(next.startsWith('#') ? next : `#${next}`);
                  }
                }}
                onBlur={() => setHexDraft(value)}
              />
            </div>

            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>
                <span>{t('Hue')}</span>
                <span>{number(hsl.h)}&deg;</span>
              </span>
              <input
                type="range"
                min={0}
                max={360}
                value={hsl.h}
                className={styles.hueSlider}
                aria-label={t('Hue')}
                onChange={(event) => setChannel('h', Number(event.target.value))}
              />
            </div>

            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>
                <span>{t('Saturation')}</span>
                <span>{number(hsl.s)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={hsl.s}
                className={styles.slider}
                aria-label={t('Saturation')}
                style={{
                  background: `linear-gradient(to right, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`,
                }}
                onChange={(event) => setChannel('s', Number(event.target.value))}
              />
            </div>

            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>
                <span>{t('Brightness')}</span>
                <span>{number(hsl.l)}%</span>
              </span>
              <input
                type="range"
                min={10}
                max={90}
                value={hsl.l}
                className={styles.slider}
                aria-label={t('Brightness')}
                style={{
                  background: `linear-gradient(to right, hsl(${hsl.h}, ${hsl.s}%, 20%), hsl(${hsl.h}, ${hsl.s}%, 50%), hsl(${hsl.h}, ${hsl.s}%, 80%))`,
                }}
                onChange={(event) => setChannel('l', Number(event.target.value))}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
