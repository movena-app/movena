import { useId } from 'react';
import { Button } from '@/shared/ui/Button';
import { DialogShell } from '@/shared/ui/DialogShell';
import styles from './FourKQualityNotice.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface FourKQualityNoticeProps {
  onClose: () => void;
}

/**
 * Shown the first time someone opens the 4K Ultra HD smart category.
 * Nothing in the catalogue can independently confirm a channel's real
 * resolution before it's actually played — this tab groups channels by
 * whatever the provider claims (title, quality field, tags) unless a
 * channel has been verified by watching it, at which point the real,
 * decoded resolution takes over. Until then, a "4K" label here is the
 * provider's word for it, not a guarantee.
 */
export function FourKQualityNotice({ onClose }: FourKQualityNoticeProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();

  return (
    <DialogShell
      onClose={onClose}
      className={styles.dialog}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusSelector="[data-modal-initial-focus]"
    >
      <h2 id={titleId} className={styles.title}>
        {t('About the 4K Ultra HD list')}
      </h2>
      <p id={descriptionId} className={styles.description}>
        {t(
          'Channels appear here based on what the provider labels them as, not an independent check. A channel marked "4K" may actually stream at a lower resolution. Once you play a channel, Movena verifies its real resolution and updates this list to match.',
        )}
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          className={styles.confirmButton}
          onClick={onClose}
          data-modal-initial-focus
        >
          {t('Got it')}
        </Button>
      </div>
    </DialogShell>
  );
}
