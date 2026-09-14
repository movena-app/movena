// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];
const checker = path.resolve('scripts', 'check-architecture.mjs');

function runFixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'movena-architecture-'));
  fixtures.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  try {
    return execFileSync(process.execPath, [checker, '--root', root], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { force: true, recursive: true });
});

describe('architecture enforcement', () => {
  it('accepts layered imports through a module public contract', () => {
    const output = runFixture({
      'shared/value.ts': 'export const value = 1;',
      'modules/catalog/public.ts': "export { item } from './item';",
      'modules/catalog/item.ts':
        "import { value } from '@/shared/value'; export const item = value;",
      'modules/library/page.ts': "import { item } from '@/modules/catalog/public'; void item;",
      'platform/runtime.ts': "import { value } from '@/shared/value'; void value;",
      'app/App.ts': "import { item } from '@/modules/catalog/public'; void item;",
    });
    expect(output).toContain('Architecture check passed');
  });

  it('rejects private cross-module imports and dependency cycles', () => {
    const output = runFixture({
      'modules/catalog/private.ts':
        "import { library } from '@/modules/library/private'; export const catalog = library;",
      'modules/library/private.ts':
        "import { catalog } from '@/modules/catalog/private'; export const library = catalog;",
    });
    expect(output).toContain('cross-module imports must use');
    expect(output).toContain('dependency cycle');
  });

  it('rejects product and Tauri dependencies from shared', () => {
    const output = runFixture({
      'modules/catalog/public.ts': 'export const item = 1;',
      'shared/bad.ts':
        "import { item } from '@/modules/catalog/public'; import '@tauri-apps/api/core'; void item;",
    });
    expect(output).toContain('shared cannot import');
    expect(output).toContain('direct Tauri import');
  });
});
