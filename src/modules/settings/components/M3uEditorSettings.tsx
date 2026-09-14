import { Select } from '@/shared/ui/Select';
import { useSettingsStore } from '../store/useSettingsStore';
import { SettingsGroup, SettingsInput, SettingsRow, SettingsToggle } from './SettingsControls';

export function M3uEditorSettings() {
  const settings = useSettingsStore();

  return (
    <SettingsGroup
      title="Playlist Editor Defaults"
      description="Choose how the dedicated M3U workspace behaves. Source URLs and credentials remain source-specific."
    >
      <SettingsRow
        title="Table Density"
        description="Compact shows more channels; comfortable leaves more room for metadata."
      >
        <Select
          value={settings.m3uEditorDensity}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
          onChange={(value) => settings.updateSetting('m3uEditorDensity', value)}
          variant="settings"
          width="160px"
          ariaLabel="M3U editor table density"
        />
      </SettingsRow>
      <SettingsRow
        title="Draft Recovery"
        description="Keep a local draft for each playlist and restore it after closing the editor."
      >
        <SettingsToggle
          label="Autosave M3U editor drafts"
          checked={settings.m3uEditorAutosaveDrafts}
          onChange={(checked) => settings.updateSetting('m3uEditorAutosaveDrafts', checked)}
        />
      </SettingsRow>
      <SettingsRow
        title="Confirm Destructive Actions"
        description="Ask before deleting groups, offline streams, or multiple selected channels."
      >
        <SettingsToggle
          label="Confirm destructive M3U editor actions"
          checked={settings.m3uEditorConfirmDestructive}
          onChange={(checked) => settings.updateSetting('m3uEditorConfirmDestructive', checked)}
        />
      </SettingsRow>
      <SettingsRow
        title="Remember Workspace Filters"
        description="Restore the last search, category, type, and health filters."
      >
        <SettingsToggle
          label="Remember M3U editor filters"
          checked={settings.m3uEditorRememberFilters}
          onChange={(checked) => settings.updateSetting('m3uEditorRememberFilters', checked)}
        />
      </SettingsRow>
      <SettingsRow
        title="Preserve Unknown Tags"
        description="Retain provider attributes, comments, and directives that Movena does not interpret."
      >
        <SettingsToggle
          label="Preserve unknown M3U tags"
          checked={settings.m3uPreserveUnknownTags}
          onChange={(checked) => settings.updateSetting('m3uPreserveUnknownTags', checked)}
        />
      </SettingsRow>
      <SettingsRow
        title="Stream Probe Timeout"
        description="Maximum time for each native reachability check."
      >
        <SettingsInput
          type="number"
          min={1}
          max={30}
          value={Math.round(settings.m3uHealthTimeoutMs / 1000)}
          onChange={(event) =>
            settings.updateSetting(
              'm3uHealthTimeoutMs',
              Math.max(1, Math.min(30, Number(event.target.value) || 6)) * 1000,
            )
          }
          aria-label="Stream probe timeout in seconds"
        />
      </SettingsRow>
      <SettingsRow
        title="Parallel Stream Probes"
        description="Higher values finish sooner but use more provider connections."
      >
        <SettingsInput
          type="number"
          min={1}
          max={12}
          value={settings.m3uHealthConcurrency}
          onChange={(event) =>
            settings.updateSetting(
              'm3uHealthConcurrency',
              Math.max(1, Math.min(12, Number(event.target.value) || 5)),
            )
          }
          aria-label="Parallel stream probes"
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
