const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /^(?:authorization|cookie|credential|password|passwd|secret|token|username)$/i;
const QUERY_SECRET = /([?&](?:password|passwd|token|username)=)[^&#\s]*/gi;
const XC_PATH_SECRET = /(\/(?:live|movie|series)\/)[^/\s]+\/[^/\s]+\//gi;
const ENCODED_QUERY_SECRET = /(%(?:3f|26)(?:password|passwd|token|username)%3d)(?:(?!%26|\s).)*/gi;
const ENCODED_XC_PATH_SECRET =
  /(%2f(?:live|movie|series)%2f)(?:(?!%2f|\s).)+%2f(?:(?!%2f|\s).)+%2f/gi;
const URL_VALUE = /\b(?:https?|rtsp|rtmp|rtp|mms|file):\/\/[^\s"'<>]+/gi;
const ENCODED_URL_VALUE =
  /\b(?:https?|rtsp|rtmp|rtp|mms|file)%3a%2f%2f(?:(?!\s|%22|%27|%3c|%3e).)+/gi;
const WINDOWS_PATH = /\b[a-z]:[\\/][^\r\n"'<>]*/gi;
const UNIX_PRIVATE_PATH = /(^|\s)\/(?:Users|home|Volumes|tmp|var|private|mnt|media)\/[^\s"'<>]*/g;

function redactUrlValue(match: string): string {
  const payload = match.slice(match.indexOf('://') + 3).replace(/[.,;:!?]+$/u, '');
  return payload ? '[URL]' : match;
}

/** Removes provider credentials from URLs, messages, and serialized errors. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(QUERY_SECRET, `$1${REDACTED}`)
    .replace(XC_PATH_SECRET, `$1${REDACTED}/${REDACTED}/`)
    .replace(ENCODED_QUERY_SECRET, `$1${REDACTED}`)
    .replace(ENCODED_XC_PATH_SECRET, `$1${REDACTED}%2F${REDACTED}%2F`);
}

/** Diagnostics retain the error meaning but never retain a media URL or local path. */
export function redactDiagnosticText(value: string): string {
  return redactSensitiveText(value)
    .replace(URL_VALUE, redactUrlValue)
    .replace(ENCODED_URL_VALUE, '[URL]')
    .replace(WINDOWS_PATH, '[PATH]')
    .replace(UNIX_PRIVATE_PATH, '$1[PATH]');
}

/**
 * Produces a JSON-safe diagnostic value with sensitive keys and credential-
 * bearing strings removed. Redaction happens before data enters the log store,
 * with report export applying it again as defense in depth.
 */
export function redactDiagnosticValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactDiagnosticText(value.message),
      stack: value.stack ? redactDiagnosticText(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactDiagnosticValue(item, seen),
    ]),
  );
}
