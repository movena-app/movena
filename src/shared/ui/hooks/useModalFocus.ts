import { useEffect, useLayoutEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseModalFocusOptions {
  enabled?: boolean | undefined;
  onClose: () => void;
  initialFocusSelector?: string | undefined;
  focusKey?: unknown | undefined;
}

/** Shared escape handling, focus containment, scroll lock, and focus restore. */
export function useModalFocus<T extends HTMLElement>({
  enabled = true,
  onClose,
  initialFocusSelector = '[data-modal-initial-focus], [autofocus]',
  focusKey,
}: UseModalFocusOptions) {
  const modalRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!enabled) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      const modal = modalRef.current;
      if (!modal) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.closest('[hidden], [inert]'),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (!modal.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === modal)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) return;

    const modal = modalRef.current;
    if (!modal || modal.contains(document.activeElement)) return;
    const initialFocus = initialFocusSelector
      ? modal.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    (initialFocus ?? modal).focus();
  }, [enabled, focusKey, initialFocusSelector]);

  return modalRef;
}
