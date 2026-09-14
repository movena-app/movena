import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import { IconButton } from '@/shared/ui/Button';
import { useModalFocus } from '@/shared/ui/hooks/useModalFocus';
import styles from './DetailsDialogShell.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface DetailsDialogShellProps {
  onClose: () => void;
  children: ReactNode;
  modalClassName?: string | undefined;
  labelledBy?: string | undefined;
  ariaLabel?: string | undefined;
  stateLayout?: boolean | undefined;
}

/**
 * Reusable detail modal shell handling portals, backdrop animations,
 * drag areas, escape key listeners, and accessible close button.
 */
export function DetailsDialogShell({
  onClose,
  children,
  modalClassName,
  labelledBy,
  ariaLabel = 'Media details',
  stateLayout = false,
}: DetailsDialogShellProps) {
  const modalRef = useModalFocus<HTMLDivElement>({ onClose });
  const { t } = useI18n();

  return createPortal(
    <motion.div
      className="uiModalOverlay"
      data-ui-layer="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        className={`uiModalPanel ${styles.modal} ${stateLayout ? styles.stateModal : ''} ${modalClassName || ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : t(ariaLabel)}
        tabIndex={-1}
        initial={{ y: 20, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 12, scale: 0.99, opacity: 0 }}
        transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.headerDragArea} data-tauri-drag-region aria-hidden="true" />

        <IconButton
          size="md"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={24} />
        </IconButton>

        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
