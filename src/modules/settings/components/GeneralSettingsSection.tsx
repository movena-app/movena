import { useSettingsStore, type MotionPreference } from '../store/useSettingsStore';
import { UI_LANGUAGE_DEFINITIONS, type UiLanguage } from '@/shared/i18n/config';
import { ensureUiMessages } from '@/shared/i18n/i18n';
import { Select } from '@/shared/ui/Select';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import {
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';

export function GeneralSettingsSection() {
  const settings = useSettingsStore();

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Language & Region"
        description="Set the interface language used across the application."
      >
        <SettingsRow
          title="Interface Language"
          description="Supported screens and metadata requests use this preference."
        >
          <Select<UiLanguage>
            value={settings.language}
            onChange={(value) => {
              void ensureUiMessages(value).then(() => settings.updateSetting('language', value));
            }}
            variant="settings"
            width={220}
            ariaLabel="Interface Language"
            options={UI_LANGUAGE_DEFINITIONS.map(({ code, label }) => ({
              value: code,
              label,
              localize: false,
            }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Window & Navigation"
        description="Control desktop window behavior and sidebar display."
      >
        <SettingsRow
          title="Keep Window on Top"
          description="Keep Movena above other desktop applications while active."
        >
          <SettingsToggle
            label="Keep Movena window on top"
            checked={settings.alwaysOnTop}
            onChange={(checked) => settings.updateSetting('alwaysOnTop', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Collapsed Sidebar Badges"
          description="Show library item counts when the navigation rail is collapsed."
        >
          <SettingsToggle
            label="Show library counts in collapsed sidebar"
            checked={settings.showCollapsedSidebarBadges}
            onChange={(checked) => settings.updateSetting('showCollapsedSidebarBadges', checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Motion & Accessibility"
        description="Control interface animations across navigation and overlays."
      >
        <SettingsRow
          title="Interface Motion"
          description="Respect operating-system preferences, reduce motion, or allow full animations."
        >
          <SegmentedControl<MotionPreference>
            value={settings.motionPreference}
            onChange={(value) => settings.updateSetting('motionPreference', value)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Updates"
        description="Control automatic release checks and update notifications."
      >
        <SettingsRow
          title="Automatic Updates"
          description="Check for new releases in the background on startup."
        >
          <SettingsToggle
            label="Automatically check for updates"
            checked={settings.autoCheckUpdates}
            onChange={(checked) => settings.updateSetting('autoCheckUpdates', checked)}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}
