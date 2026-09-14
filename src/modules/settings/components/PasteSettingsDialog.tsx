import { useId, useState } from 'react';
import {
  countChangedSettings,
  parseSettingsConfig,
  type ParsedSettingsConfig,
} from '../services/settingsConfig';
import { useSettingsStore } from '../store/useSettingsStore';
import { Button } from '@/shared/ui/Button';
import { DialogShell } from '@/shared/ui/DialogShell';
import styles from './PasteSettingsDialog.module.css';
import { getErrorMessage } from '@/shared/lib/error';
import { useI18n } from '@/shared/i18n/i18n';

interface PasteSettingsDialogProps {
  onImport: (config: ParsedSettingsConfig, changedCount: number) => void;
  onCancel: () => void;
}

export function PasteSettingsDialog({ onImport, onCancel }: PasteSettingsDialogProps) {
  const { t, tn, number } = useI18n();
  const [text, setText] = useState('');
  const titleId = useId();
  const descriptionId = useId();

  let statusMessage = t('Enter or paste your exported settings JSON to import.');
  let statusClass = styles.statusNeutral;
  let parsedConfig: ParsedSettingsConfig | null = null;
  let changedCount = 0;

  if (text.trim()) {
    try {
      parsedConfig = parseSettingsConfig(text);
      changedCount = countChangedSettings(
        useSettingsStore.getState(),
        parsedConfig.document.settings,
      );

      const ignored = parsedConfig.ignoredKeys.length;
      if (changedCount === 0) {
        const ignoredSuffix = ignored
          ? tn(' ({count} unknown key ignored)', ' ({count} unknown keys ignored)', ignored, {
              count: number(ignored),
            })
          : '';
        statusMessage = t(
          'Valid configuration: settings already match your preferences{ignored}.',
          { ignored: ignoredSuffix },
        );
        statusClass = styles.statusNeutral;
      } else {
        const ignoredSuffix = ignored
          ? tn(' ({count} unknown key ignored)', ' ({count} unknown keys ignored)', ignored, {
              count: number(ignored),
            })
          : '';
        statusMessage = tn(
          'Valid configuration: will update {count} preference{ignored}.',
          'Valid configuration: will update {count} preferences{ignored}.',
          changedCount,
          { count: number(changedCount), ignored: ignoredSuffix },
        );
        statusClass = styles.statusSuccess;
      }
    } catch (error: unknown) {
      statusMessage = getErrorMessage(error, t('Invalid settings configuration.'));
      statusClass = styles.statusError;
    }
  }

  const handleConfirm = () => {
    if (!parsedConfig) return;
    onImport(parsedConfig, changedCount);
  };

  return (
    <DialogShell
      onClose={onCancel}
      className={styles.dialog}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusSelector="[data-modal-initial-focus]"
    >
      <h2 id={titleId} className={styles.title}>
        {t('Paste Settings JSON')}
      </h2>
      <p id={descriptionId} className={styles.description}>
        {t('Paste application configuration JSON text here to apply your settings.')}
      </p>

      <textarea
        className={`${styles.textarea} uiField`}
        placeholder={t('Paste your settings JSON here...')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-modal-initial-focus
        aria-label={t('Settings JSON input')}
      />

      <div className={`${styles.statusText} ${statusClass}`} role="status">
        {statusMessage}
      </div>

      <div className={styles.actions}>
        <Button className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className={styles.confirmButton}
          onClick={handleConfirm}
          disabled={!parsedConfig}
        >
          Import Settings
        </Button>
      </div>
    </DialogShell>
  );
}
