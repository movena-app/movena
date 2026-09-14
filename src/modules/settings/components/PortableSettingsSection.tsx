import { useState } from 'react';
import { Clipboard, Copy, Download, LoaderCircle, ShieldCheck, Upload } from 'lucide-react';
import {
  countChangedSettings,
  saveSettingsConfig,
  selectSettingsConfig,
  serializeSettingsConfig,
  type SelectedSettingsConfig,
  type ParsedSettingsConfig,
} from '../services/settingsConfig';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PasteSettingsDialog } from './PasteSettingsDialog';
import {
  SettingsButton,
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
} from './SettingsControls';
import styles from '../pages/SettingsPage.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface PendingImport {
  selected: SelectedSettingsConfig;
  changedCount: number;
}

export function PortableSettingsSection() {
  const { t, tn, number } = useI18n();
  const settings = useSettingsStore();
  const [busyAction, setBusyAction] = useState<'export' | 'import' | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = async () => {
    setBusyAction('export');
    try {
      const fileName = await saveSettingsConfig(useSettingsStore.getState());
      if (!fileName) return;
      const message = t('Saved {fileName}.', { fileName });
      setStatus(message);
      notify.success('Settings Exported', message);
    } catch (error: unknown) {
      notify.error(
        'Export Failed',
        getUserFacingErrorMessage(error, 'Movena could not save the settings file.'),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectImport = async () => {
    setBusyAction('import');
    try {
      const selected = await selectSettingsConfig();
      if (!selected) return;
      const changedCount = countChangedSettings(
        useSettingsStore.getState(),
        selected.document.settings,
      );
      if (changedCount === 0) {
        const message = t('{fileName} already matches your settings.', {
          fileName: selected.fileName,
        });
        setStatus(message);
        notify.info('Settings Already Match', message);
        return;
      }
      setPendingImport({ selected, changedCount });
    } catch (error: unknown) {
      notify.error(
        'Import Failed',
        getUserFacingErrorMessage(error, 'Movena could not read the settings file.'),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const applyImport = () => {
    if (!pendingImport) return;
    settings.importSettings(pendingImport.selected.document.settings);
    const ignored = pendingImport.selected.ignoredKeys.length;
    const ignoredSuffix = ignored
      ? tn(
          '; {count} unknown entry was ignored',
          '; {count} unknown entries were ignored',
          ignored,
          { count: number(ignored) },
        )
      : '';
    const message = tn(
      'Imported {count} changed preference from {source}{ignored}.',
      'Imported {count} changed preferences from {source}{ignored}.',
      pendingImport.changedCount,
      {
        count: number(pendingImport.changedCount),
        source: pendingImport.selected.fileName,
        ignored: ignoredSuffix,
      },
    );
    setStatus(message);
    setPendingImport(null);
    notify.success('Settings Imported', message);
  };

  const handleCopy = async () => {
    try {
      const content = serializeSettingsConfig(useSettingsStore.getState());
      await navigator.clipboard.writeText(content);
      const message = t('Configuration JSON has been copied to your clipboard.');
      notify.success('Settings Copied', message);
    } catch (error: unknown) {
      notify.error(
        'Copy Failed',
        getUserFacingErrorMessage(error, 'Could not copy the settings to the clipboard.'),
      );
    }
  };

  const handlePasteImport = (parsed: ParsedSettingsConfig, changedCount: number) => {
    settings.importSettings(parsed.document.settings);
    const ignored = parsed.ignoredKeys.length;
    const ignoredSuffix = ignored
      ? tn(
          '; {count} unknown entry was ignored',
          '; {count} unknown entries were ignored',
          ignored,
          { count: number(ignored) },
        )
      : '';
    const message = tn(
      'Imported {count} changed preference from {source}{ignored}.',
      'Imported {count} changed preferences from {source}{ignored}.',
      changedCount,
      { count: number(changedCount), source: t('pasted JSON'), ignored: ignoredSuffix },
    );
    setStatus(message);
    setShowPasteModal(false);
    notify.success('Settings Imported', message);
  };

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Portable Settings"
        description="Back up your preferences or move them to another Movena installation."
      >
        <SettingsRow
          title="Export Settings"
          description="Save appearance, playback, recording, notification, category, and developer preferences as readable JSON, or copy the configuration directly."
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <SettingsButton onClick={() => void handleExport()} disabled={busyAction !== null}>
              {busyAction === 'export' ? (
                <LoaderCircle className={styles.spinner} size={15} />
              ) : (
                <Download size={15} />
              )}
              {t('Export File')}
            </SettingsButton>
            <SettingsButton onClick={() => void handleCopy()} disabled={busyAction !== null}>
              <Copy size={15} />
              {t('Copy to Clipboard')}
            </SettingsButton>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Import Settings"
          description="Review a Movena settings file or paste configuration JSON to replace your preferences in one operation."
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <SettingsButton
              variant="primary"
              onClick={() => void handleSelectImport()}
              disabled={busyAction !== null}
            >
              {busyAction === 'import' ? (
                <LoaderCircle className={styles.spinner} size={15} />
              ) : (
                <Upload size={15} />
              )}
              {t('Choose File')}
            </SettingsButton>
            <SettingsButton onClick={() => setShowPasteModal(true)} disabled={busyAction !== null}>
              <Clipboard size={15} />
              {t('Paste JSON')}
            </SettingsButton>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Privacy & Compatibility"
        description="Settings backups are versioned and validated before they can change the app."
      >
        <SettingsRow
          title="Credentials Stay Private"
          description="Provider passwords, playlist URLs and headers, watch history, favorites, and cached media are never included."
        >
          <ShieldCheck size={19} aria-label={t('Protected')} />
        </SettingsRow>
      </SettingsGroup>

      {status && (
        <p className={styles.successText} role="status">
          {status}
        </p>
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Import these settings?"
          description={tn(
            '{fileName} will replace {count} current preference. Source connections and library data will not change.',
            '{fileName} will replace {count} current preferences. Source connections and library data will not change.',
            pendingImport.changedCount,
            {
              fileName: pendingImport.selected.fileName,
              count: number(pendingImport.changedCount),
            },
          )}
          confirmLabel="Import Settings"
          onConfirm={applyImport}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {showPasteModal && (
        <PasteSettingsDialog
          onImport={handlePasteImport}
          onCancel={() => setShowPasteModal(false)}
        />
      )}
    </SettingsPageContent>
  );
}
