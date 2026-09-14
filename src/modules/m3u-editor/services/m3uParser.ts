import {
  parseM3u,
  type M3uPlaylist,
  type ParseM3uOptions,
} from '@/modules/sources/public/data/m3uClient';

interface ParseResponse {
  id: number;
  playlist?: M3uPlaylist | undefined;
  error?: string | undefined;
}

interface PendingParse {
  resolve: (playlist: M3uPlaylist) => void;
  reject: (error: Error) => void;
}

// Below this size, worker setup and structured-clone overhead costs more than
// the parse. Provider playlists large enough to create visible long tasks are
// kept entirely off the webview thread.
const WORKER_PARSE_THRESHOLD = 100_000;
const pendingParses = new Map<number, PendingParse>();
let parserWorker: Worker | null = null;
let nextRequestId = 1;

function rejectPending(error: Error): void {
  for (const pending of pendingParses.values()) pending.reject(error);
  pendingParses.clear();
}

function getParserWorker(): Worker | null {
  if (parserWorker) return parserWorker;
  if (typeof Worker === 'undefined') return null;

  try {
    const worker = new Worker(new URL('../workers/m3uParser.worker', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (event: MessageEvent<ParseResponse>) => {
      const pending = pendingParses.get(event.data.id);
      if (!pending) return;
      pendingParses.delete(event.data.id);
      if (event.data.playlist) pending.resolve(event.data.playlist);
      else pending.reject(new Error(event.data.error || 'The playlist could not be parsed.'));
    });
    worker.addEventListener('error', () => {
      rejectPending(new Error('The playlist parser stopped unexpectedly.'));
      worker.terminate();
      if (parserWorker === worker) parserWorker = null;
    });
    parserWorker = worker;
    return worker;
  } catch {
    return null;
  }
}

/** Clears adapter state between isolated tests without exposing worker details to callers. */
export function resetM3uParserWorkerForTests(): void {
  parserWorker?.terminate();
  parserWorker = null;
  pendingParses.clear();
  nextRequestId = 1;
}

/** Parses large provider playlists without blocking the React/webview event
 * loop. Small documents and test environments retain the direct parser. */
export function parseM3uAsync(
  content: string,
  options: Partial<ParseM3uOptions> = {},
): Promise<M3uPlaylist> {
  if (content.length < WORKER_PARSE_THRESHOLD) {
    return Promise.resolve().then(() => parseM3u(content, options));
  }

  const worker = getParserWorker();
  if (!worker) return Promise.resolve().then(() => parseM3u(content, options));

  const id = nextRequestId++;
  return new Promise<M3uPlaylist>((resolve, reject) => {
    pendingParses.set(id, { resolve, reject });
    worker.postMessage({ id, content, options });
  });
}
