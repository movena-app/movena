import { AlertTriangle, LoaderCircle, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../i18n/i18n';
import styles from './ErrorState.module.css';

interface ErrorStateProps {
  title: string;
  description: string;
  /**
   * Concrete technical detail (e.g. "403 Forbidden", "Timed out after 5s"),
   * shown as-is beneath the localized description. Status codes and network
   * reasons are conventionally left untranslated, so this bypasses `t()`.
   */
  detail?: string | null | undefined;
  icon?: LucideIcon | undefined;
  actionIcon?: LucideIcon | null | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  secondaryActionLabel?: string | undefined;
  onSecondaryAction?: (() => void) | undefined;
  isRetrying?: boolean | undefined;
  compact?: boolean | undefined;
  modal?: boolean | undefined;
  player?: boolean | undefined;
  className?: string | undefined;
}

/** Shared, actionable error treatment for pages, sidebars, dialogs and player chrome. */
export function ErrorState({
  title,
  description,
  detail,
  icon: Icon = AlertTriangle,
  actionIcon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  isRetrying = false,
  compact = false,
  modal = false,
  player = false,
  className = '',
}: ErrorStateProps) {
  const { t } = useI18n();
  const ActionIcon =
    actionIcon === undefined
      ? /^(try again|reconnect)$/i.test(actionLabel ?? '')
        ? RefreshCw
        : null
      : actionIcon;
  return (
    <section
      className={`${styles.container} ${compact ? styles.compact : ''} ${modal ? styles.modal : ''} ${player ? styles.player : ''} ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className={styles.iconBadge} aria-hidden="true">
        <Icon size={compact ? 20 : modal ? 22 : 26} />
      </div>
      <div className={styles.copy}>
        <h2 className={styles.title}>{t(title)}</h2>
        <p className={styles.description}>{t(description)}</p>
        {detail && <p className={styles.detail}>{detail}</p>}
      </div>
      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <div className={styles.actions}>
          {actionLabel && onAction && (
            <Button
              variant="primary"
              className={styles.primaryAction}
              onClick={onAction}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <LoaderCircle className={styles.spinner} size={16} />
              ) : ActionIcon ? (
                <ActionIcon size={16} />
              ) : null}
              <span>{isRetrying ? t('Trying again') : t(actionLabel)}</span>
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button className={styles.secondaryAction} onClick={onSecondaryAction}>
              {t(secondaryActionLabel)}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
