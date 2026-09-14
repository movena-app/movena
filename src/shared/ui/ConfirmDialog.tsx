import { useId } from 'react';
import { Button } from './Button';
import { DialogShell } from './DialogShell';
import styles from './ConfirmDialog.module.css';
import { useI18n } from '../i18n/i18n';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean | undefined;
  isConfirming?: boolean | undefined;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  isConfirming = false,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  return (
    <DialogShell
      onClose={onCancel}
      className={styles.dialog}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusSelector="[data-modal-initial-focus]"
      dismissDisabled={isConfirming}
    >
      <h2 id={titleId} className={styles.title}>
        {t(title)}
      </h2>
      <p id={descriptionId} className={styles.description}>
        {t(description)}
      </p>
      <div className={styles.actions}>
        <Button
          className={styles.cancelButton}
          onClick={onCancel}
          data-modal-initial-focus
          disabled={isConfirming}
        >
          {t('Cancel')}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          className={styles.confirmButton}
          onClick={onConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? t('Deleting…') : t(confirmLabel)}
        </Button>
      </div>
    </DialogShell>
  );
}
