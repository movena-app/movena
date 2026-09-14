import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from './hooks/useModalFocus';

interface DialogShellProps {
  children: ReactNode;
  onClose: () => void;
  className?: string | undefined;
  overlayClassName?: string | undefined;
  role?: 'dialog' | 'alertdialog' | undefined;
  ariaLabel?: string | undefined;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  initialFocusSelector?: string | undefined;
  dismissOnBackdrop?: boolean | undefined;
  dismissDisabled?: boolean | undefined;
  focusKey?: unknown;
}

/** Portal, focus, dismissal, and global layer contract for ordinary dialogs. */
export function DialogShell({
  children,
  onClose,
  className,
  overlayClassName,
  role = 'dialog',
  ariaLabel,
  labelledBy,
  describedBy,
  initialFocusSelector,
  dismissOnBackdrop = true,
  dismissDisabled = false,
  focusKey,
}: DialogShellProps) {
  const panelRef = useModalFocus<HTMLDivElement>({
    onClose: () => {
      if (!dismissDisabled) onClose();
    },
    initialFocusSelector,
    focusKey,
  });
  const dismiss = dismissOnBackdrop && !dismissDisabled ? onClose : undefined;
  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();

  return createPortal(
    <div
      className={`uiModalOverlay ${overlayClassName ?? ''}`}
      data-ui-layer="modal"
      onMouseDown={dismiss}
    >
      <div
        ref={panelRef}
        className={`${className ?? ''} uiModalPanel`}
        role={role}
        aria-modal="true"
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onMouseDown={stopPropagation}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
