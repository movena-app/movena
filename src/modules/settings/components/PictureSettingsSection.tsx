import { useSettingsStore } from '../store/useSettingsStore';
import {
  applyImageAdjustment,
  applyImageAdjustments,
  DEFAULT_IMAGE_ADJUSTMENTS,
  type ImageAdjustments,
} from '@/modules/playback/public/components/imageSettings';
import {
  SettingsButton,
  SettingsGroup,
  SettingsPageContent,
  SettingsRange,
  SettingsRow,
} from './SettingsControls';
import { useI18n } from '@/shared/i18n/i18n';

const PICTURE_CONTROLS: Array<{
  key: keyof ImageAdjustments;
  title: string;
  description: string;
  min: number;
  max: number;
  format: (value: number) => string;
}> = [
  {
    key: 'imageSharpness',
    title: 'Sharpness',
    description: 'Increase edge clarity. Off is neutral.',
    min: 0,
    max: 100,
    format: (value) => (value === 0 ? 'Off' : `${Math.round(value)}`),
  },
  {
    key: 'imageBrightness',
    title: 'Brightness',
    description: 'Adjust overall picture brightness.',
    min: 0,
    max: 200,
    format: (value) => `${Math.round(value)}%`,
  },
  {
    key: 'imageContrast',
    title: 'Contrast',
    description: 'Adjust separation between light and dark areas.',
    min: -100,
    max: 100,
    format: (value) => `${Math.round(value)}`,
  },
  {
    key: 'imageSaturation',
    title: 'Saturation',
    description: 'Adjust color intensity.',
    min: -100,
    max: 100,
    format: (value) => `${Math.round(value)}`,
  },
  {
    key: 'imageHue',
    title: 'Hue',
    description: 'Shift the picture color balance.',
    min: -100,
    max: 100,
    format: (value) => `${Math.round(value)}`,
  },
  {
    key: 'imageGamma',
    title: 'Dark Scene',
    description: 'Lift or deepen detail in dark scenes.',
    min: -100,
    max: 100,
    format: (value) => `${Math.round(value)}`,
  },
];

export function PictureSettingsSection() {
  const { t } = useI18n();
  const settings = useSettingsStore();

  const setPictureAdjustment = (key: keyof ImageAdjustments, value: number) => {
    const next = { ...settings, [key]: value } as ImageAdjustments;
    settings.updateSetting(key, value);
    void applyImageAdjustment(key, next);
  };

  const resetPictureAdjustments = () => {
    for (const control of PICTURE_CONTROLS) {
      settings.updateSetting(control.key, DEFAULT_IMAGE_ADJUSTMENTS[control.key]);
    }
    void applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS);
  };

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Picture Adjustments"
        description="Persist picture tuning across streams. These changes also apply to the active player."
      >
        {PICTURE_CONTROLS.map((control) => (
          <SettingsRow key={control.key} title={control.title} description={control.description}>
            <SettingsRange
              aria-label={control.title}
              min={control.min}
              max={control.max}
              value={settings[control.key]}
              onChange={(event) => setPictureAdjustment(control.key, Number(event.target.value))}
              formatValue={(value) => t(control.format(value))}
            />
          </SettingsRow>
        ))}
        <SettingsRow
          title="Reset Picture Adjustments"
          description="Return all image controls to their neutral values."
        >
          <SettingsButton
            onClick={resetPictureAdjustments}
            disabled={PICTURE_CONTROLS.every(
              (control) => settings[control.key] === DEFAULT_IMAGE_ADJUSTMENTS[control.key],
            )}
          >
            Reset Picture
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}
