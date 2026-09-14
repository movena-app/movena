import { useState } from 'react';
import { AlertTriangle, Bug, Clipboard, RotateCcw } from 'lucide-react';
import { desktopApi } from '@/platform/desktop';
import { useI18n } from '@/shared/i18n/i18n';
import {
  copyCrashDiagnosticReport,
  type CrashDetails,
} from '@/modules/diagnostics/services/crashDiagnostics';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { redactDiagnosticText } from '@/shared/lib/redact';
import { Button } from '@/shared/ui/Button';
import styles from './CrashRecovery.module.css';

const ISSUE_URL = 'https://github.com/movena-app/movena/issues/new?template=bug-report.yml';

interface CrashRecoveryProps extends CrashDetails {
  title: string;
  description: string;
}

export function CrashRecovery({ error, componentStack, title, description }: CrashRecoveryProps) {
  const { t } = useI18n();
  const debugMode = useSettingsStore((state) => state.debugMode);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const restart = async () => {
    if (desktopApi.isDesktop()) {
      try {
        await desktopApi.relaunch();
        return;
      } catch {
        // A browser reload is the last recoverable option if process restart fails.
      }
    }
    window.location.reload();
  };

  const copyReport = async () => {
    try {
      await copyCrashDiagnosticReport({ error, componentStack });
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const reportIssue = async () => {
    if (desktopApi.isDesktop()) await desktopApi.openUrl(ISSUE_URL);
    else window.open(ISSUE_URL, '_blank', 'noopener,noreferrer');
  };

  const detail = redactDiagnosticText(error.stack ?? error.message);

  return (
    <main className={styles.page} role="alert" aria-live="assertive">
      <section className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          <AlertTriangle size={28} />
        </div>
        <h1>{t(title)}</h1>
        <p>{t(description)}</p>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={() => void restart()}>
            <RotateCcw size={16} aria-hidden="true" /> {t('Restart Movena')}
          </Button>
          <Button onClick={() => void copyReport()}>
            <Clipboard size={16} aria-hidden="true" /> {t('Copy diagnostic report')}
          </Button>
          <Button variant="ghost" onClick={() => void reportIssue()}>
            <Bug size={16} aria-hidden="true" /> {t('Report an Issue')}
          </Button>
        </div>
        {copyState !== 'idle' && (
          <p className={copyState === 'failed' ? styles.statusError : styles.status} role="status">
            {t(
              copyState === 'copied'
                ? 'Sanitized diagnostic report copied to the clipboard.'
                : 'The diagnostic report could not be copied.',
            )}
          </p>
        )}
        {debugMode && (
          <details className={styles.details}>
            <summary>{t('Technical details')}</summary>
            <pre>{detail}</pre>
          </details>
        )}
      </section>
    </main>
  );
}
