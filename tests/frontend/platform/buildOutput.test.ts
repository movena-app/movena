import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/build-output.mjs');
const temporaryDirectories: string[] = [];

function buildDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'movena-build-output-'));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html>');
  writeFileSync(join(directory, 'assets', 'app.js'), 'export {};');
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release build output validation', () => {
  it('accepts the finite web asset allowlist', () => {
    const directory = buildDirectory();
    expect(() => execFileSync(process.execPath, [script, 'check', directory])).not.toThrow();
  });

  it('rejects unrelated media left in the release tree', () => {
    const directory = buildDirectory();
    writeFileSync(join(directory, 'private-recording.mp4'), 'not release content');

    expect(() =>
      execFileSync(process.execPath, [script, 'check', directory], { stdio: 'pipe' }),
    ).toThrow(/unexpected file types/);
  });
});
