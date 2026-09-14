import { useEffect, useState } from 'react';
import { desktopApi } from '@/platform/desktop';
import { RefreshCw, Bug, ExternalLink, Download } from 'lucide-react';
import { DiscordIcon, GithubIcon } from '@/shared/ui/icons';
import { notify } from '@/shared/notifications/useNotificationStore';
import { clearAllAppData } from '../services/appDataReset';
import { useUpdateStore } from '@/modules/updates/public/store/useUpdateStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import {
  SettingsButton,
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
} from './SettingsControls';
import styles from '../pages/SettingsPage.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { deleteTmdbApiKey } from '@/modules/metadata/public/services/tmdbCredentialVault';
import { getErrorMessage } from '@/shared/lib/error';
import { formatBytes } from '@/shared/lib/formatBytes';

export function AboutSettingsSection() {
  const { t, number } = useI18n();
  const settings = useSettingsStore();
  const [confirmAction, setConfirmAction] = useState<'settings' | 'all-data' | null>(null);
  const [isClearingData, setIsClearingData] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  const updatePhase = useUpdateStore((state) => state.phase);
  const updateInfo = useUpdateStore((state) => state.info);
  const updateProgress = useUpdateStore((state) => state.progress);
  const checkForUpdates = useUpdateStore((state) => state.check);
  const installUpdate = useUpdateStore((state) => state.install);
  const dismissUpdate = useUpdateStore((state) => state.dismiss);

  useEffect(() => {
    desktopApi
      .getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const handleCheckUpdates = async () => {
    await checkForUpdates();
    const { phase, error } = useUpdateStore.getState();
    if (phase !== 'idle') return; // 'available' renders its own panel below
    if (error) {
      notify.warning('Update Check', error);
    } else {
      notify.info(
        'Up to Date',
        `Movena ${appVersion ? `v${appVersion}` : ''} is the latest version.`,
      );
    }
  };

  const handleInstallUpdate = async () => {
    await installUpdate();
    const { phase, error } = useUpdateStore.getState();
    // A successful install relaunches the app before this line would run in
    // practice — reaching 'idle' with an error means downloadAndInstall
    // rejected (network drop, signature mismatch, disk full, ...).
    if (phase === 'idle' && error) {
      notify.error('Update Failed', error);
    }
  };

  const handleResetSettings = async () => {
    try {
      await deleteTmdbApiKey();
      settings.resetSettings();
      setConfirmAction(null);
      notify.warning('Settings Reset', 'Application settings were restored to their defaults.');
    } catch (error: unknown) {
      notify.error(
        'Settings Could Not Be Reset',
        getErrorMessage(error, 'Credential deletion failed without an error message.'),
      );
    }
  };

  const handleDeleteAllData = async () => {
    setIsClearingData(true);
    try {
      await clearAllAppData();
      setConfirmAction(null);
      notify.warning(
        'All Data Deleted',
        'All Movena settings, sources, history, downloads, and caches were removed. Restart the app to begin setup again.',
      );
    } catch (error: unknown) {
      notify.error(
        'Could Not Delete Data',
        getErrorMessage(error, 'Application data deletion failed without an error message.'),
      );
    } finally {
      setIsClearingData(false);
    }
  };

  const progressPercent = updateProgress?.total
    ? Math.min(100, Math.round((updateProgress.downloaded / updateProgress.total) * 100))
    : null;
  const progressByteText = updateProgress
    ? updateProgress.total
      ? t('{downloaded} of {total}', {
          downloaded: formatBytes(updateProgress.downloaded, number) ?? '0 B',
          total: formatBytes(updateProgress.total, number) ?? '0 B',
        })
      : formatBytes(updateProgress.downloaded, number)
    : null;

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Movena Desktop"
        description={`Version ${appVersion ?? '…'} · Tauri 2 · Rust · React · libmpv`}
      >
        <div className={styles.aboutBody}>
          <p className={styles.aboutTagline}>
            {t('A native desktop client for Xtream and M3U live TV, movies, and series.')}
          </p>
          <div className={styles.aboutLinks}>
            <SettingsButton onClick={handleCheckUpdates} disabled={updatePhase !== 'idle'}>
              <RefreshCw
                size={15}
                className={updatePhase === 'checking' ? 'animate-spin' : undefined}
              />{' '}
              {t('Check for Updates')}
            </SettingsButton>
            <SettingsButton
              onClick={() => void desktopApi.openUrl('https://discord.gg/hRHpwVPjBN')}
            >
              <DiscordIcon size={15} /> Discord
            </SettingsButton>
            <SettingsButton
              onClick={() => void desktopApi.openUrl('https://github.com/movena-app/movena')}
            >
              <GithubIcon size={15} /> {t('View on GitHub')}
            </SettingsButton>
            <SettingsButton
              onClick={() =>
                void desktopApi.openUrl('https://github.com/movena-app/movena/issues/new')
              }
            >
              <Bug size={15} /> {t('Report an Issue')}
            </SettingsButton>
          </div>

          {updateInfo &&
            (updatePhase === 'available' ||
              updatePhase === 'downloading' ||
              updatePhase === 'restarting') && (
              <div className={styles.updatePanel}>
                <div className={styles.updatePanelHeader}>
                  <span className={styles.updatePanelTitle}>
                    {t('Movena {version} is available', { version: `v${updateInfo.version}` })}
                  </span>
                  <span className={styles.updatePanelMeta}>
                    {t('You have {version}', { version: `v${updateInfo.currentVersion}` })}
                  </span>
                </div>

                {updateInfo.body && updatePhase === 'available' && (
                  <p className={styles.updatePanelNotes}>{updateInfo.body}</p>
                )}

                {updatePhase === 'available' && (
                  <div className={styles.updatePanelActions}>
                    <SettingsButton variant="primary" onClick={handleInstallUpdate}>
                      <Download size={15} /> {t('Download & Install')}
                    </SettingsButton>
                    <SettingsButton onClick={dismissUpdate}>{t('Later')}</SettingsButton>
                  </div>
                )}

                {updatePhase === 'downloading' && (
                  <div className={styles.updatePanelProgress}>
                    <div className={styles.progressTrack} aria-label={t('Downloading update')}>
                      <span
                        style={{ width: progressPercent === null ? '35%' : `${progressPercent}%` }}
                      />
                    </div>
                    <span className={styles.updatePanelMeta}>
                      {progressPercent === null
                        ? (progressByteText ?? t('Downloading…'))
                        : `${number(progressPercent)}%${progressByteText ? ` · ${progressByteText}` : ''}`}
                    </span>
                  </div>
                )}

                {updatePhase === 'restarting' && (
                  <div className={styles.updatePanelProgress}>
                    <RefreshCw size={15} className="animate-spin" />
                    <span className={styles.updatePanelMeta}>
                      {t('Installed. Restarting Movena…')}
                    </span>
                  </div>
                )}
              </div>
            )}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Metadata & Community Sources"
        description="This product uses the TMDB API but is not endorsed or certified by TMDB. Release dates, artwork, and ratings are provided by TMDB. TVmaze data is licensed under CC BY-SA 4.0 and provides exact TV air times. IntroDB provides crowdsourced intro, recap, and outro timestamps."
      >
        <div className={styles.aboutBody}>
          <div className={styles.aboutLinks}>
            <SettingsButton onClick={() => void desktopApi.openUrl('https://www.themoviedb.org')}>
              <ExternalLink size={15} /> TMDB
            </SettingsButton>
            <SettingsButton onClick={() => void desktopApi.openUrl('https://www.tvmaze.com')}>
              <ExternalLink size={15} /> TVmaze
            </SettingsButton>
            <SettingsButton onClick={() => void desktopApi.openUrl('https://introdb.app')}>
              <ExternalLink size={15} /> IntroDB
            </SettingsButton>
            <SettingsButton
              onClick={() =>
                void desktopApi.openUrl('https://creativecommons.org/licenses/by-sa/4.0/')
              }
            >
              <ExternalLink size={15} /> CC BY-SA 4.0
            </SettingsButton>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Open Source & Lawful Use"
        description="Movena is free software licensed under GPL-3.0-or-later. It provides no channels, subscriptions, playlists, or media and is not affiliated with or endorsed by Xtream Codes or any content provider."
      >
        <div className={styles.aboutBody}>
          <p className={styles.aboutTagline}>
            Configure only sources you are authorized to access. Record or download media only when
            you have the necessary rights. Movena does not bypass DRM.
          </p>
          <div className={styles.aboutLinks}>
            <SettingsButton
              onClick={() =>
                void desktopApi.openUrl('https://github.com/movena-app/movena/blob/main/LICENSE')
              }
            >
              <ExternalLink size={15} /> GPL-3.0-or-later
            </SettingsButton>
            <SettingsButton
              onClick={() =>
                void desktopApi.openUrl(
                  'https://github.com/movena-app/movena/blob/main/docs/PRIVACY.md',
                )
              }
            >
              <ExternalLink size={15} /> Privacy
            </SettingsButton>
            <SettingsButton
              onClick={() =>
                void desktopApi.openUrl(
                  'https://github.com/movena-app/movena/blob/main/docs/THIRD_PARTY_NOTICES.md',
                )
              }
            >
              <ExternalLink size={15} /> Third-party notices
            </SettingsButton>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Danger Zone"
        description="Irreversible and disruptive actions for application settings and local data."
        danger
      >
        <SettingsRow
          title="Reset Settings"
          description="Restore playback, appearance, notification, and developer preferences. Source connections, favorites, collections, and watch history are kept."
        >
          <SettingsButton variant="danger" onClick={() => setConfirmAction('settings')}>
            Reset Settings
          </SettingsButton>
        </SettingsRow>

        <SettingsRow
          title="Delete All App Data"
          description="Removes settings, sources and credentials, library data, searches, download records, and cached content."
        >
          <SettingsButton variant="danger" onClick={() => setConfirmAction('all-data')}>
            Delete All Data
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>

      {confirmAction === 'settings' && (
        <ConfirmDialog
          title="Reset all settings?"
          description="Playback, appearance, notification, recording, and developer preferences will return to their defaults. Your source connections and library data will remain."
          confirmLabel="Reset Settings"
          danger
          onConfirm={handleResetSettings}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'all-data' && (
        <ConfirmDialog
          title="Delete all Movena data?"
          description="This permanently removes settings, sources and credentials, history, favorites, collections, searches, download records, and cached content. Original playlist files and completed downloads are not removed."
          confirmLabel="Delete All Data"
          danger
          onConfirm={handleDeleteAllData}
          onCancel={() => setConfirmAction(null)}
          isConfirming={isClearingData}
        />
      )}
    </SettingsPageContent>
  );
}
