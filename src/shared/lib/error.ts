import { redactDiagnosticText, redactDiagnosticValue } from './redact';

/** Extracts the concrete failure reported by fetch, Tauri IPC, and plugins. */
function getRawErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown | undefined }).message;
    if (typeof message === 'string' && message.trim()) {
      const code = 'code' in error ? (error as { code?: unknown | undefined }).code : undefined;
      if (
        (typeof code === 'string' || typeof code === 'number') &&
        !message.includes(String(code))
      ) {
        return `${String(code)}: ${message}`;
      }
      return message;
    }
  }

  if (error !== null && error !== undefined && typeof error !== 'string') {
    try {
      const serialized =
        typeof error === 'object' ? JSON.stringify(redactDiagnosticValue(error)) : String(error);
      if (serialized?.trim()) return serialized;
    } catch {
      const stringified = String(error);
      if (stringified.trim() && stringified !== '[object Object]') return stringified;
    }
  }

  return fallback;
}

/** Returns useful failure detail without exposing URLs, paths, or credentials. */
export function getErrorMessage(error: unknown, fallback: string): string {
  return redactDiagnosticText(getRawErrorMessage(error, fallback));
}

/**
 * Returns a privacy-safe error for visible form messages and notifications.
 * The fallback is used only when the failure did not provide any usable text.
 */
export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback);
}

/** Keeps every distinct failure when multiple providers or startup steps fail together. */
export function getCombinedErrorMessage(errors: readonly unknown[], fallback: string): string {
  const messages = errors
    .filter((error) => error !== null && error !== undefined)
    .map((error) => getErrorMessage(error, ''))
    .filter((message, index, all) => Boolean(message) && all.indexOf(message) === index);
  return messages.length > 0 ? messages.join('\n') : fallback;
}

export interface ErrorPresentation {
  title: string;
  description: string;
  kind:
    | 'offline'
    | 'timeout'
    | 'authentication'
    | 'configuration'
    | 'server'
    | 'invalid-response'
    | 'unknown';
  /**
   * Privacy-safe, untranslated error text shown alongside the friendly copy.
   */
  detail: string | null;
}

function titleSubject(subject: string): string {
  const trimmed = subject.trim();
  return trimmed ? `${trimmed[0]!.toLocaleUpperCase()}${trimmed.slice(1)}` : 'Content';
}

function getHttpStatus(message: string): number | null {
  const match = message.match(
    /(?:\bhttp(?:\s+(?:request|response))?(?:\s+failed)?(?:\s+with)?(?:\s+status)?\s*[:(]?|\brequest\s+failed\s*\(?\s*(?:http\s*)?|\bapi\s+error\s*:\s*|\banswered\s+(?:http\s*)?)([1-5]\d{2})\b/i,
  );
  return match ? Number(match[1]) : null;
}

/** Adds friendly context without replacing the low-level failure. */
export function getErrorPresentation(error: unknown, subject: string): ErrorPresentation {
  const rawMessage = getRawErrorMessage(error, '');
  const message = rawMessage.toLowerCase();
  const httpStatus = getHttpStatus(rawMessage);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const headingSubject = titleSubject(subject);
  const detail = rawMessage ? redactDiagnosticText(rawMessage) : null;

  if (
    offline ||
    /failed to fetch|networkerror|network error|load failed|offline|connection refused|econnrefused|enotfound|dns|network unreachable|connection reset/.test(
      message,
    )
  ) {
    return {
      kind: 'offline',
      title: `Can’t reach ${subject}`,
      description:
        'Check your network connection and make sure the source is still online, then try again.',
      detail,
    };
  }

  if (httpStatus === 408 || /timed?\s*out|timeout|err_connection_timed_out/.test(message)) {
    return {
      kind: 'timeout',
      title: `${headingSubject} took too long to respond`,
      description: 'The source may be busy or temporarily unavailable. Try again in a moment.',
      detail,
    };
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /\bauthentication\b|\bauth\s+(?:failed|error)\b|\bcredentials?\b|account expired|unauthori[sz]ed|forbidden|access denied/.test(
      message,
    )
  ) {
    return {
      kind: 'authentication',
      title: 'Your provider needs attention',
      description:
        'The saved account was rejected or has expired. Check its connection details in Settings.',
      detail,
    };
  }

  if (
    (httpStatus !== null &&
      httpStatus >= 400 &&
      httpStatus < 500 &&
      httpStatus !== 408 &&
      httpStatus !== 429) ||
    /\b(?:bad request|not found|gone|unprocessable)\b|certificate|ssl|tls/.test(message)
  ) {
    return {
      kind: 'configuration',
      title: 'Check your source settings',
      description:
        'The source address or connection details may have changed. Review them in Settings, then try again.',
      detail,
    };
  }

  if (
    /html error|invalid json|unexpected response|malformed|not a valid|unsupported response/.test(
      message,
    )
  ) {
    return {
      kind: 'invalid-response',
      title: `Couldn’t read ${subject}`,
      description: 'The source sent data Movena could not use. Check the source and try again.',
      detail,
    };
  }

  if (
    httpStatus === 429 ||
    (httpStatus !== null && httpStatus >= 500) ||
    /too many requests/.test(message)
  ) {
    return {
      kind: 'server',
      title: `${headingSubject} is temporarily unavailable`,
      description: 'The source is unavailable or busy right now. Try again in a moment.',
      detail,
    };
  }

  return {
    kind: 'unknown',
    title: `Couldn’t load ${subject}`,
    description: 'Try again. If the problem continues, check the source connection in Settings.',
    detail,
  };
}

/** React Query retry policy: retry transient transport/server failures, never cancellations or account failures. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const rawMessage = getRawErrorMessage(error, '');
  const message = rawMessage.toLowerCase();
  const httpStatus = getHttpStatus(rawMessage);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (
    /abort|cancel|\bauthentication\b|\bauth\s+(?:failed|error)\b|\bcredentials?\b|account expired|unauthori[sz]ed|forbidden|access denied/.test(
      message,
    )
  )
    return false;
  if (
    httpStatus !== null &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    httpStatus !== 408 &&
    httpStatus !== 429
  )
    return false;
  if (
    /html error|invalid json|unexpected response|malformed|not a valid|unsupported response|certificate|ssl|tls/.test(
      message,
    )
  )
    return false;
  return true;
}
