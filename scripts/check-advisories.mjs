import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Advisory databases change without a commit, so a new advisory against a
// dependency main already ships would fail every pull request until main is
// fixed. With ADVISORY_BASE set to a revision, advisories that revision already
// has are reported as warnings and only new ones fail. Without it, all fail.
const projectRoot = resolve(import.meta.dirname, '..');
// A push that creates the branch reports an all-zero previous revision.
const base = (process.env.ADVISORY_BASE ?? '').trim().replace(/^0+$/, '');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // npm is a .cmd shim on Windows.
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.error) throw result.error;
  return result;
}

function cargoAdvisories(root) {
  const result = run(
    'cargo',
    [
      'deny',
      '--format',
      'json',
      '--manifest-path',
      join(root, 'src-tauri', 'Cargo.toml'),
      'check',
      'advisories',
    ],
    root,
  );
  if (/no such command: `?deny/.test(result.stderr)) {
    throw new Error('cargo-deny is missing. Install it with: cargo install --locked cargo-deny');
  }
  const found = new Map();
  for (const line of result.stderr.split('\n')) {
    if (!line.startsWith('{')) continue;
    const { type, fields } = JSON.parse(line);
    if (type !== 'diagnostic' || fields.severity !== 'error') continue;
    const krate = fields.graphs?.[0]?.Krate;
    if (!krate) throw new Error(`cargo deny: ${fields.message}`);
    const id = fields.advisory?.id ?? fields.code;
    // An advisory covers a version range; a yank covers one version.
    const key = fields.advisory
      ? `cargo ${krate.name} ${id}`
      : `cargo ${krate.name}@${krate.version} ${id}`;
    found.set(key, `${krate.name}@${krate.version} ${id}: ${fields.message}`);
  }
  if (result.status !== 0 && found.size === 0) {
    throw new Error(`cargo deny check advisories failed:\n${result.stderr}`);
  }
  return found;
}

function npmAdvisories(root) {
  const result = run('npm', ['audit', '--package-lock-only', '--omit=dev', '--json'], root);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm audit failed:\n${result.stderr}`);
  }
  if (!report.vulnerabilities) {
    throw new Error(`npm audit failed: ${report.error?.summary ?? result.stderr}`);
  }
  const found = new Map();
  // Runtime dependencies ship to users; desktop-only test tooling does not.
  for (const { via } of Object.values(report.vulnerabilities)) {
    for (const advisory of via) {
      if (typeof advisory !== 'object' || !['high', 'critical'].includes(advisory.severity)) {
        continue;
      }
      found.set(
        `npm ${advisory.name} ${advisory.url}`,
        `${advisory.name} ${advisory.range} ${advisory.url}: ${advisory.title}`,
      );
    }
  }
  return found;
}

function advisoriesAt(revision) {
  const directory = mkdtempSync(join(tmpdir(), 'movena-advisories-'));
  const worktree = join(directory, 'base');
  try {
    if (run('git', ['cat-file', '-e', `${revision}^{commit}`], projectRoot).status !== 0) {
      execFileSync('git', ['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', revision], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
    }
    execFileSync('git', ['worktree', 'add', '--quiet', '--detach', worktree, revision], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    return new Set([...cargoAdvisories(worktree).keys(), ...npmAdvisories(worktree).keys()]);
  } finally {
    run('git', ['worktree', 'remove', '--force', worktree], projectRoot);
    rmSync(directory, { recursive: true, force: true });
  }
}

function annotate(level, message) {
  if (!process.env.GITHUB_ACTIONS) {
    console.log(`${level}: ${message}`);
    return;
  }
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log(`::${level}::${escaped}`);
}

// Check this revision first: an advisory published in between then only shows
// up at the base, where it cannot fail the change.
const findings = new Map([...cargoAdvisories(projectRoot), ...npmAdvisories(projectRoot)]);
const known = base && findings.size > 0 ? advisoriesAt(base) : new Set();

let failed = false;
for (const [key, message] of findings) {
  if (known.has(key)) {
    annotate('warning', `${message} (already present before this change)`);
  } else {
    annotate('error', message);
    failed = true;
  }
}
if (findings.size === 0) console.log('No Rust or runtime npm advisories.');
process.exit(failed ? 1 : 0);
