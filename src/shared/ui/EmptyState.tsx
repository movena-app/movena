import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../i18n/i18n';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string | null | undefined;
  actionLabel?: string | undefined;
  actionIcon?: LucideIcon | undefined;
  onAction?: (() => void) | undefined;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  detail,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className={styles.container}>
      <div className={styles.iconContainer}>
        <Icon size={32} className={styles.icon} />
      </div>

      <h2 className={styles.title}>{t(title)}</h2>
      <p className={styles.description}>{t(description)}</p>
      {detail && <p className={styles.detail}>{detail}</p>}

      {actionLabel && onAction && (
        <Button variant="primary" className={styles.actionBtn} onClick={onAction}>
          {ActionIcon && <ActionIcon size={16} aria-hidden="true" />}
          {t(actionLabel)}
        </Button>
      )}
    </div>
  );
}
