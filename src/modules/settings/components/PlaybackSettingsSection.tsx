import {
  useSettingsStore,
  type HdrMode,
  type HwdecMode,
  type ToneMappingMode,
} from '../store/useSettingsStore';
import type { AspectMode } from '@/modules/catalog/public/lib/aspect';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import {
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';
import { useI18n } from '@/shared/i18n/i18n';

export function PlaybackSettingsSection() {
  const { number } = useI18n();
  const settings = useSettingsStore();
  const toneMappingDisabled = settings.hdrMode !== 'off';

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Video Output"
        description="Rendering and color behavior used whenever playback starts."
      >
        <SettingsRow
          title="Hardware Acceleration"
          description="Decode video on the GPU to reduce CPU usage."
        >
          <SettingsToggle
            label="Enable hardware acceleration"
            checked={settings.hardwareAcceleration}
            onChange={(checked) => settings.updateSetting('hardwareAcceleration', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Hardware Decode Strategy"
          description="Auto Safe prioritizes compatibility; Maximum favors direct GPU decoding."
          disabled={!settings.hardwareAcceleration}
        >
          <SegmentedControl<HwdecMode>
            value={settings.hwdecMode}
            onChange={(value) => settings.updateSetting('hwdecMode', value)}
            disabled={!settings.hardwareAcceleration}
            options={[
              { value: 'auto-safe', label: 'Auto Safe' },
              { value: 'auto', label: 'Maximum' },
              { value: 'no', label: 'Software' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Default Aspect Ratio"
          description="Picture framing applied at the start of playback."
          wideControl
        >
          <SegmentedControl<AspectMode>
            value={settings.aspectRatio}
            onChange={(value) => settings.updateSetting('aspectRatio', value)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: '16:9', label: '16:9' },
              { value: '4:3', label: '4:3' },
              { value: 'zoom', label: 'Zoom' },
              { value: 'stretch', label: 'Stretch' },
              { value: '1:1', label: '1:1' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="HDR Output"
          description="Preserve HDR when supported, or convert HDR content to SDR."
        >
          <SegmentedControl<HdrMode>
            value={settings.hdrMode}
            onChange={(value) => settings.updateSetting('hdrMode', value)}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'off', label: 'Tone Map to SDR' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Tone-Mapping Algorithm"
          description="Color conversion used only when HDR output is set to SDR."
          disabled={toneMappingDisabled}
          wideControl
        >
          <SegmentedControl<ToneMappingMode>
            value={settings.toneMappingMode}
            onChange={(value) => settings.updateSetting('toneMappingMode', value)}
            disabled={toneMappingDisabled}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'bt.2446a', label: 'BT.2446a' },
              { value: 'hable', label: 'Filmic' },
              { value: 'reinhard', label: 'Reinhard' },
              { value: 'mobius', label: 'Mobius' },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Streaming & Seeking"
        description="Balance responsiveness, memory use, and seek behavior."
      >
        <SettingsRow
          title="Maximum Stream Buffer"
          description="Maximum memory available to mpv for stream buffering."
          wideControl
        >
          <SegmentedControl
            value={settings.demuxerMaxBytes}
            onChange={(value) => settings.updateSetting('demuxerMaxBytes', value)}
            options={[
              { value: '50MiB', label: '50 MiB' },
              { value: '150MiB', label: '150 MiB' },
              { value: '300MiB', label: '300 MiB' },
              { value: '500MiB', label: '500 MiB' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Pre-roll Buffer"
          description="Seconds mpv may buffer ahead during playback."
        >
          <SegmentedControl
            value={settings.cacheSecs}
            onChange={(value) => settings.updateSetting('cacheSecs', value)}
            options={[3, 5, 10, 15, 30].map((value) => ({ value, label: `${number(value)} s` }))}
          />
        </SettingsRow>

        <SettingsRow
          title="Seek Step"
          description="Time skipped by the keyboard arrow keys and seek controls."
        >
          <SegmentedControl
            value={settings.seekJumpSecs}
            onChange={(value) => settings.updateSetting('seekJumpSecs', value)}
            options={[5, 10, 15, 30, 60].map((value) => ({ value, label: `${number(value)} s` }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Connection Recovery"
        description="How long startup may take and whether alternate stream URLs should be tried."
      >
        <SettingsRow
          title="Startup Timeout"
          description="Time before a stream is considered unable to start."
        >
          <SegmentedControl
            value={settings.startupTimeoutMs}
            onChange={(value) => settings.updateSetting('startupTimeoutMs', value)}
            options={[10_000, 20_000, 30_000, 60_000].map((value) => ({
              value,
              label: `${number(value / 1000)} s`,
            }))}
          />
        </SettingsRow>
        <SettingsRow
          title="Stream Failover"
          description="Try an alternate URL when the current stream fails."
        >
          <SettingsToggle
            label="Enable stream failover"
            checked={settings.streamFailoverEnabled}
            onChange={(checked) => settings.updateSetting('streamFailoverEnabled', checked)}
          />
        </SettingsRow>
        <SettingsRow title="Failover Attempts" disabled={!settings.streamFailoverEnabled}>
          <SegmentedControl
            value={settings.maxStreamFailovers}
            onChange={(value) => settings.updateSetting('maxStreamFailovers', value)}
            options={[0, 1, 2, 3].map((value) => ({ value, label: String(value) }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Episodes"
        description="Automatic actions available during series playback."
      >
        <SettingsRow
          title="Auto-play Next Episode"
          description="Start the next episode after the current one ends, with time to cancel."
        >
          <SettingsToggle
            label="Auto-play the next episode"
            checked={settings.autoPlayNextEpisode}
            onChange={(checked) => settings.updateSetting('autoPlayNextEpisode', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Skip Intro Action"
          description="Show the Skip Intro button when the file has matching chapters or community timestamps."
        >
          <SettingsToggle
            label="Show Skip Intro action"
            checked={settings.skipIntroEnabled}
            onChange={(checked) => settings.updateSetting('skipIntroEnabled', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Skip Recap Action"
          description="Show the Skip Recap button when a recap segment is detected."
        >
          <SettingsToggle
            label="Show Skip Recap action"
            checked={settings.skipRecapEnabled}
            onChange={(checked) => settings.updateSetting('skipRecapEnabled', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Auto-Skip Intro & Recap"
          description="Automatically seek past intros and recaps without needing to click the prompt."
        >
          <SettingsToggle
            label="Automatically skip intros and recaps"
            checked={settings.autoSkipIntro}
            onChange={(checked) => settings.updateSetting('autoSkipIntro', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Community Timestamps (IntroDB)"
          description="Look up crowdsourced intro and recap timestamps when files lack embedded chapters."
        >
          <SettingsToggle
            label="Enable IntroDB community timestamps"
            checked={settings.introDbEnabled}
            onChange={(checked) => settings.updateSetting('introDbEnabled', checked)}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}
