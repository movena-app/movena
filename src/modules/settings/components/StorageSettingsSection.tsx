import { useEffect } from 'react';
import { desktopApi } from '@/platform/desktop';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { startQueuedDownloads } from '@/modules/downloads/public/services/mediaDownload';
import {
  SettingsButton,
  SettingsGroup,
  SettingsInput,
  SettingsPageContent,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';
import { useI18n } from '@/shared/i18n/i18n';

export function StorageSettingsSection() {
  const { t } = useI18n();
  const settings = useSettingsStore();

  useEffect(() => {
    startQueuedDownloads();
  }, [settings.autoStartDownloads, settings.maxConcurrentDownloads]);

  const chooseDownloadDirectory = async () => {
    try {
      const selection = await desktopApi.openPath({ directory: true, multiple: false });
      if (selection && !Array.isArray(selection))
        settings.updateSetting('downloadDirectory', selection);
    } catch (error: unknown) {
      notify.error(
        'Folder Could Not Be Selected',
        getUserFacingErrorMessage(error, 'Movena could not open the folder picker.'),
      );
    }
  };

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Recording"
        description="Movena writes live recordings below your Downloads folder. Record only media you are authorized to copy; Movena does not bypass DRM."
      >
        <SettingsRow
          title="Save Folder"
          description="Use a relative folder name; missing folders are created automatically."
          wideControl
        >
          <SettingsInput
            type="text"
            value={settings.recordingPath}
            onChange={(event) => settings.updateSetting('recordingPath', event.target.value)}
            placeholder="Movena Recordings"
            aria-label="Recording save folder"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </SettingsRow>
        <SettingsRow
          title="Quick Record Button"
          description="Show recording access directly in the live-player controls."
        >
          <SettingsToggle
            label="Show Quick Record button"
            checked={settings.instantRecord}
            onChange={(checked) => settings.updateSetting('instantRecord', checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Downloads"
        description="Downloaded media is saved here. Download only media you are authorized to copy. Leave the folder blank to use your system Downloads folder."
      >
        <SettingsRow
          title="Save Folder"
          description="Use the folder picker for a native path, or enter an absolute path manually."
          wideControl
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <SettingsInput
              value={settings.downloadDirectory}
              onChange={(event) => settings.updateSetting('downloadDirectory', event.target.value)}
              placeholder="System Downloads"
              aria-label="Download save folder"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <SettingsButton
              onClick={() => void chooseDownloadDirectory()}
              aria-label="Choose download folder"
            >
              <FolderOpen size={15} />
              {t('Choose')}
            </SettingsButton>
            {settings.downloadDirectory && (
              <SettingsButton
                onClick={() => settings.updateSetting('downloadDirectory', '')}
                aria-label="Use system Downloads folder"
                iconOnly
              >
                <RotateCcw size={15} />
              </SettingsButton>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Queue Behavior"
        description="Control how many files can download at once and whether new downloads begin immediately."
      >
        <SettingsRow
          title="Parallel Downloads"
          description="More simultaneous downloads use more bandwidth and provider connections."
        >
          <SettingsInput
            type="number"
            min={1}
            max={8}
            step={1}
            value={settings.maxConcurrentDownloads}
            onChange={(event) =>
              settings.updateSetting(
                'maxConcurrentDownloads',
                Math.max(1, Math.min(8, Number(event.target.value) || 1)),
              )
            }
            aria-label="Maximum parallel downloads"
          />
        </SettingsRow>
        <SettingsRow
          title="Start Automatically"
          description="When disabled, player downloads wait in the queue until you press Start."
        >
          <SettingsToggle
            label="Start downloads automatically"
            checked={settings.autoStartDownloads}
            onChange={(checked) => settings.updateSetting('autoStartDownloads', checked)}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}
