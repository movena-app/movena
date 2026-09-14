import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { RiPauseFill, RiPlayFill, RiVolumeUpLine } from '@/shared/ui/icons';
import styles from './PlayerControls.module.css';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import { useI18n } from '@/shared/i18n/i18n';

export function FeedbackHud() {
  const { t, number } = useI18n();
  const feedback = usePlayerStore((s) => s.feedback);

  const feedbackLabel =
    feedback?.type === 'volume'
      ? t('Volume {percent} percent', { percent: number(feedback.value ?? 0) })
      : feedback?.type === 'play'
        ? t('Play')
        : feedback?.type === 'pause'
          ? t('Pause')
          : undefined;

  const renderIcon = () => {
    if (!feedback) return null;

    switch (feedback.type) {
      case 'play':
        return <RiPlayFill size={32} style={{ marginLeft: 3 }} />;
      case 'pause':
        return <RiPauseFill size={32} />;
      case 'volume':
        return (
          <>
            <RiVolumeUpLine size={32} />
            <span className={styles.feedbackText}>{number(feedback.value ?? 0)}%</span>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence mode="popLayout">
      {feedback && (
        <motion.div className={styles.feedbackWrapper} role="status" aria-label={feedbackLabel}>
          <motion.div
            key={`${feedback.type}-${feedback.key}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 1.2] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: MOTION_DURATION.feedback,
              times: [0, 0.15, 0.7, 1],
              ease: MOTION_EASE.standard,
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className={styles.feedbackCircle}>{renderIcon()}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
