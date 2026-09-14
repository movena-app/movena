import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Replaces `globalThis.localStorage` with a plain in-memory `Storage`.
 *
 * Node (22+) defines its own `localStorage` global, but leaves it
 * unusable — `typeof localStorage` is `undefined` — unless the process is
 * started with `--localstorage-file`. That inert global still counts as
 * present (`'localStorage' in globalThis`), and vitest's happy-dom
 * environment only overrides globals that are *absent* from Node's own
 * global object; since this one already exists, happy-dom's real
 * implementation never gets installed over it. Every test that touches
 * `localStorage` fails identically — `Cannot read properties of undefined`
 * — regardless of what the test is actually about. Assigning a working
 * implementation here, once, is simpler than persuading either side to
 * change its precedence rules.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});

afterEach(() => {
  cleanup();
});
