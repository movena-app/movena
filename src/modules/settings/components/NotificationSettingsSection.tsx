import { useSettingsStore } from '../store/useSettingsStore';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import {
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';
import { useI18n } from '@/shared/i18n/i18n';

const TOGGLES = [
  [
    'dndDuringPlayback',
    'Do Not Disturb During Playback',
    'Suppress non-critical information while media is playing',
  ],
  [
    'notifyPlaybackEvents',
    'Playback & Stream Alerts',
    'Show recording and playback-status notifications',
  ],
  [
    'notifyConnectionStatus',
    'Provider & Connection Alerts',
    'Show account and server-connection notifications',
  ],
  [
    'notifyLibraryUpdates',
    'Library & Recording Alerts',
    'Show favorites, watch-history, and recording notifications',
  ],
  [
    'notifyDownloadEvents',
    'Download Alerts',
    'Show download start, completion, and failure notifications',
  ],
  ['notifySound', 'Notification Audio Chime', 'Play a subtle sound when a notification appears'],
] as const;

export function NotificationSettingsSection() {
  const { number } = useI18n();
  const settings = useSettingsStore();

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Delivery"
        description="Control whether and where in-app notifications appear."
      >
        <SettingsRow
          title="Enable Notifications"
          description="Show in-app status and event notifications."
        >
          <SettingsToggle
            label="Enable notifications"
            checked={settings.enableNotifications}
            onChange={(checked) => settings.updateSetting('enableNotifications', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Screen Position"
          description="Corner used for notification cards."
          disabled={!settings.enableNotifications}
          wideControl
        >
          <SegmentedControl
            value={settings.toastPosition}
            onChange={(value) => settings.updateSetting('toastPosition', value)}
            disabled={!settings.enableNotifications}
            options={[
              { value: 'top-right', label: 'Top Right' },
              { value: 'top-left', label: 'Top Left' },
              { value: 'bottom-right', label: 'Bottom Right' },
              { value: 'bottom-left', label: 'Bottom Left' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Display Duration"
          description="How long each notification remains visible."
          disabled={!settings.enableNotifications}
        >
          <SegmentedControl
            value={settings.toastDurationSecs}
            onChange={(value) => settings.updateSetting('toastDurationSecs', value)}
            disabled={!settings.enableNotifications}
            options={[3, 4.5, 7, 10].map((value) => ({ value, label: `${number(value)} s` }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Events" description="Choose which activity should interrupt you.">
        {TOGGLES.map(([key, title, description]) => (
          <SettingsRow
            key={key}
            title={title}
            description={`${description}.`}
            disabled={!settings.enableNotifications}
          >
            <SettingsToggle
              label={title}
              checked={settings[key]}
              onChange={(checked) => settings.updateSetting(key, checked)}
              disabled={!settings.enableNotifications}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </SettingsPageContent>
  );
}
