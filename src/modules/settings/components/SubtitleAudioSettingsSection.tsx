import { useSettingsStore } from '../store/useSettingsStore';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import {
  SettingsGroup,
  SettingsInput,
  SettingsPageContent,
  SettingsRange,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';
import { useI18n } from '@/shared/i18n/i18n';

export function SubtitleAudioSettingsSection() {
  const { number } = useI18n();
  const settings = useSettingsStore();

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Playback Speed"
        description="Default speed applied when a new video or episode starts."
      >
        <SettingsRow
          title="Default Playback Speed"
          description="Speed used when a new video or episode starts."
        >
          <SegmentedControl
            value={settings.rememberedPlaybackSpeed}
            onChange={(value) => settings.updateSetting('rememberedPlaybackSpeed', value)}
            options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => ({
              value,
              label: `${number(value)}×`,
            }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Subtitles"
        description="Default subtitle appearance and behavior for all streams."
      >
        <SettingsRow
          title="Subtitles by Default"
          description="Show subtitles when a new stream starts, when a subtitle track is available."
        >
          <SettingsToggle
            label="Enable subtitles by default"
            checked={settings.subtitlesEnabled}
            onChange={(checked) => settings.updateSetting('subtitlesEnabled', checked)}
          />
        </SettingsRow>
        <SettingsRow title="Subtitle Size" description="Native MPV subtitle font size.">
          <SettingsInput
            aria-label="Subtitle size"
            type="number"
            min={12}
            max={96}
            value={settings.subtitleFontSize}
            onChange={(event) =>
              settings.updateSetting(
                'subtitleFontSize',
                Math.max(12, Math.min(96, Number(event.target.value) || 38)),
              )
            }
          />
        </SettingsRow>
        <SettingsRow title="Subtitle Font" description="Font family name available on this system.">
          <SettingsInput
            aria-label="Subtitle font"
            value={settings.subtitleFontFamily}
            onChange={(event) => settings.updateSetting('subtitleFontFamily', event.target.value)}
          />
        </SettingsRow>
        <SettingsRow title="Subtitle Opacity" description="Transparency applied to subtitle text.">
          <SettingsRange
            aria-label="Subtitle opacity"
            min={0}
            max={100}
            value={settings.subtitleOpacity}
            onChange={(event) =>
              settings.updateSetting('subtitleOpacity', Number(event.target.value))
            }
            formatValue={(value) => `${value}%`}
          />
        </SettingsRow>
        <SettingsRow
          title="Subtitle Border"
          description="Thickness of the outline around subtitle text."
        >
          <SettingsRange
            aria-label="Subtitle border size"
            min={0}
            max={12}
            value={settings.subtitleBorderSize}
            onChange={(event) =>
              settings.updateSetting('subtitleBorderSize', Number(event.target.value))
            }
            formatValue={(value) => `${value}px`}
          />
        </SettingsRow>
        <SettingsRow
          title="Subtitle Shadow"
          description="Offset of the subtitle drop shadow for readability."
        >
          <SettingsRange
            aria-label="Subtitle shadow offset"
            min={0}
            max={12}
            value={settings.subtitleShadowOffset}
            onChange={(event) =>
              settings.updateSetting('subtitleShadowOffset', Number(event.target.value))
            }
            formatValue={(value) => `${value}px`}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Audio" description="Audio synchronization settings applied globally.">
        <SettingsRow
          title="Audio Delay"
          description="Shift audio relative to video when a source is out of sync."
        >
          <SettingsInput
            aria-label="Audio delay"
            type="number"
            min={-5000}
            max={5000}
            step={50}
            value={settings.audioDelayMs}
            onChange={(event) =>
              settings.updateSetting(
                'audioDelayMs',
                Math.max(-5000, Math.min(5000, Number(event.target.value) || 0)),
              )
            }
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}
