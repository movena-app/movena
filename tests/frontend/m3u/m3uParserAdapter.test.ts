import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseM3uAsync,
  resetM3uParserWorkerForTests,
} from '@/modules/m3u-editor/services/m3uParser';

class WorkerMock {
  static latest: WorkerMock | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    WorkerMock.latest = this;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(type, listener as (event: MessageEvent) => void);
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data } as MessageEvent);
  }
}

afterEach(() => {
  resetM3uParserWorkerForTests();
  vi.unstubAllGlobals();
  WorkerMock.latest = null;
});

describe('M3U worker adapter', () => {
  it('uses direct parsing below the worker threshold', async () => {
    await expect(
      parseM3uAsync('#EXTM3U\n#EXTINF:-1,Channel\nhttps://media.test/live'),
    ).resolves.toMatchObject({ entries: [{ title: 'Channel' }] });
  });

  it('resolves and rejects matching worker responses without crossing request IDs', async () => {
    vi.stubGlobal('Worker', WorkerMock);
    const first = parseM3uAsync(
      `#EXTM3U\n#EXTINF:-1,Channel\nhttps://media.test/live\n${' '.repeat(100_000)}`,
    );
    const worker = WorkerMock.latest!;
    const firstId = (worker.postMessage.mock.calls[0]![0] as { id: number }).id;
    worker.emit('message', { id: firstId + 99, error: 'stale' });
    worker.emit('message', { id: firstId, playlist: { entries: [], epgUrls: [], warnings: [] } });
    await expect(first).resolves.toMatchObject({ entries: [] });

    const second = parseM3uAsync(
      `#EXTM3U\n#EXTINF:-1,Channel\nhttps://media.test/live\n${' '.repeat(100_000)}`,
    );
    const secondId = (worker.postMessage.mock.calls[1]![0] as { id: number }).id;
    worker.emit('message', { id: secondId, error: 'invalid guide' });
    await expect(second).rejects.toThrow('invalid guide');
  });

  it('rejects pending work and replaces a worker after an error', async () => {
    vi.stubGlobal('Worker', WorkerMock);
    const pending = parseM3uAsync(
      `#EXTM3U\n#EXTINF:-1,Channel\nhttps://media.test/live\n${' '.repeat(100_000)}`,
    );
    const failedWorker = WorkerMock.latest!;
    failedWorker.emit('error', null);
    await expect(pending).rejects.toThrow('stopped unexpectedly');
    expect(failedWorker.terminate).toHaveBeenCalledOnce();

    void parseM3uAsync(
      `#EXTM3U\n#EXTINF:-1,Channel\nhttps://media.test/live\n${' '.repeat(100_000)}`,
    );
    expect(WorkerMock.latest).not.toBe(failedWorker);
  });
});
