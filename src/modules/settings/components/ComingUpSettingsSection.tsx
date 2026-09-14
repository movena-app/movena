import { useSettingsStore, type UpcomingHistoryDays } from '../store/useSettingsStore';
import { Select } from '@/shared/ui/Select';
import {
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';

const HISTORY_OPTIONS: Array<{ value: UpcomingHistoryDays; label: string }> = [
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

export function ComingUpSettingsSection() {
  const settings = useSettingsStore();
  const scheduleDisabled = !settings.upcomingEnabled;

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Release Tracking"
        description="Choose what Movena tracks for saved movies and series, including what happens after release time."
      >
        <SettingsRow
          title="Enable Coming Up"
          description="Show the Coming Up workspace and append announced episodes to the details of favorite series."
        >
          <SettingsToggle
            label="Enable Coming Up"
            checked={settings.upcomingEnabled}
            onChange={(checked) => settings.updateSetting('upcomingEnabled', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Recently Released"
          description="Keep premieres and aired episodes visible after release instead of removing them immediately."
          disabled={scheduleDisabled}
        >
          <Select<UpcomingHistoryDays>
            value={settings.upcomingHistoryDays}
            onChange={(value) => settings.updateSetting('upcomingHistoryDays', value)}
            options={HISTORY_OPTIONS}
            variant="settings"
            width={160}
            disabled={scheduleDisabled}
            ariaLabel="Recently released retention"
          />
        </SettingsRow>

        <SettingsRow
          title="Exact TV Times"
          description="Use TVmaze for exact episode airtimes and fuller recent and future schedules. TMDB date-only data remains the fallback."
          disabled={scheduleDisabled || !settings.tmdbEnabled}
        >
          <SettingsToggle
            label="Look up exact TV airtimes"
            checked={settings.upcomingExactTimesEnabled}
            disabled={scheduleDisabled || !settings.tmdbEnabled}
            onChange={(checked) => settings.updateSetting('upcomingExactTimesEnabled', checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Presentation"
        description="Choose where the release schedule appears and how much timing detail it shows."
      >
        <SettingsRow
          title="Show on Home"
          description="Show a compact release row on the Home screen. Upcoming items appear before recent releases."
          disabled={scheduleDisabled}
        >
          <SettingsToggle
            label="Show Coming Up on Home"
            checked={settings.upcomingHomeEnabled}
            disabled={scheduleDisabled}
            onChange={(checked) => settings.updateSetting('upcomingHomeEnabled', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Live Countdowns"
          description="Update exact release countdowns every second. Date-only releases remain marked by calendar day."
          disabled={scheduleDisabled}
        >
          <SettingsToggle
            label="Show live release countdowns"
            checked={settings.upcomingCountdownEnabled}
            disabled={scheduleDisabled}
            onChange={(checked) => settings.updateSetting('upcomingCountdownEnabled', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Calendar View"
          description="Allow switching between the timeline and a monthly release calendar."
          disabled={scheduleDisabled}
        >
          <SettingsToggle
            label="Show release calendar"
            checked={settings.upcomingCalendarEnabled}
            disabled={scheduleDisabled}
            onChange={(checked) => settings.updateSetting('upcomingCalendarEnabled', checked)}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}
