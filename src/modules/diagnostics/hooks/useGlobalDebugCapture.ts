import { useEffect } from 'react';
import { debugLog } from '../store/useDebugStore';

function describeReason(reason: unknown): { message: string; details: unknown } {
  if (reason instanceof Error) {
    return {
      message: reason.message || reason.name,
      details: reason,
    };
  }

  if (typeof reason === 'string') {
    return { message: reason, details: reason };
  }

  return { message: 'Unknown rejection reason', details: reason };
}

/** Captures browser-level failures that would otherwise only reach DevTools. */
export function useGlobalDebugCapture(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const handleError = (event: ErrorEvent) => {
      debugLog.error('system', `Unhandled error: ${event.message || 'Unknown error'}`, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = describeReason(event.reason);
      debugLog.error('system', `Unhandled promise rejection: ${reason.message}`, reason.details);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [enabled]);
}
