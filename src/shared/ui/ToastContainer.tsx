import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useNotificationStore, type NotificationItem } from '../notifications/useNotificationStore';
import { Button, IconButton } from './Button';
import styles from './ToastContainer.module.css';
import { MOTION_DURATION, MOTION_EASE } from '../design/motion';
import { useI18n } from '../i18n/i18n';

function ToastCard({ notification }: { notification: NotificationItem }) {
  const { t } = useI18n();
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const [isPaused, setIsPaused] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const duration = notification.duration || 4500;

  useEffect(() => {
    if (isPaused || duration <= 0) return;

    const timer = setTimeout(() => {
      removeNotification(notification.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [notification.id, duration, isPaused, removeNotification]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <Check size={16} strokeWidth={2.5} />;
      case 'error':
        return <XCircle size={16} strokeWidth={2.2} />;
      case 'warning':
        return <AlertTriangle size={16} strokeWidth={2.2} />;
      case 'info':
      default:
        return <Info size={16} strokeWidth={2.2} />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
      className={`${styles.toastItem} ${styles[notification.type]}`}
      role={notification.type === 'error' ? 'alert' : 'status'}
      aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={styles.toastContent}>
        <div className={styles.iconBadge}>{getIcon()}</div>

        <div className={styles.body}>
          <div className={styles.title}>{t(notification.title)}</div>
          {notification.message && <div className={styles.message}>{t(notification.message)}</div>}

          {notification.action && (
            <Button
              size="sm"
              className={styles.actionBtn}
              onClick={() => {
                notification.action?.onClick();
                removeNotification(notification.id);
              }}
            >
              {t(notification.action.label)}
            </Button>
          )}
        </div>

        <IconButton
          size="sm"
          className={styles.closeBtn}
          onClick={() => removeNotification(notification.id)}
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </IconButton>
      </div>

      {duration > 0 && (
        <motion.div
          ref={progressRef}
          className={styles.progressBar}
          initial={{ scaleX: 1 }}
          animate={isPaused ? {} : { scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

export interface ToastContainerProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  suppressDuringPlayback?: boolean;
  playbackActive?: boolean;
}

export function ToastContainer({
  enabled = true,
  position = 'top-right',
  suppressDuringPlayback = false,
  playbackActive = false,
}: ToastContainerProps) {
  const notifications = useNotificationStore((state) => state.notifications);

  if (!enabled) return null;

  // Suppress non-critical notifications while playing media if DND during playback is enabled
  const visibleNotifications =
    suppressDuringPlayback && playbackActive
      ? notifications.filter((n) => n.type === 'error')
      : notifications;

  const positionClass =
    position === 'top-left'
      ? styles.topLeft
      : position === 'bottom-right'
        ? styles.bottomRight
        : position === 'bottom-left'
          ? styles.bottomLeft
          : styles.topRight;

  return (
    <div className={`${styles.toastContainer} ${positionClass}`} data-ui-layer="toast">
      <AnimatePresence mode="sync">
        {visibleNotifications.map((notification) => (
          <ToastCard key={notification.id} notification={notification} />
        ))}
      </AnimatePresence>
    </div>
  );
}
