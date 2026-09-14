// Movena's macOS build bundles libmpv and its full runtime dependency
// closure (ffmpeg, libass, freetype, fontconfig, ...) into the .app via
// scripts/bundle-macos-mpv.mjs, instead of requiring the end user to have
// `brew install mpv` themselves. Redistributing those libraries carries the
// same license obligations as any other bundled dependency, but they never
// pass through package-lock.json or Cargo.lock, so generate-third-party-
// licenses.mjs (which reads exactly those two lockfiles, run once on
// Windows — see compliance.yml) can't see them at all.
//
// This is the macOS-only counterpart: run from the build-macos CI job right
// after `brew install mpv`, before the Rust/Tauri build starts, so it can
// walk Homebrew's own installed copy of libmpv — independent of anything
// our own build produces yet — and record exactly what's about to be
// bundled. Its output is embedded into the app itself (see
// tauri.bundle.macos.conf.json's resources), not merged into the repo's
// top-level THIRD_PARTY_LICENSES.txt, because it's true only for this one
// platform's build and would otherwise make that Windows-generated report
// inaccurate for Windows/Linux users.
//
// Run from the repo root: node scripts/generate-macos-runtime-licenses.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  console.error('This script only makes sense on macOS.');
  process.exit(1);
}

const projectRoot = resolve(import.meta.dirname, '..');
const outputDir = join(projectRoot, 'src-tauri', 'macos-runtime-notices');
const outputPath = join(outputDir, 'THIRD_PARTY_NOTICES.txt');

function findSystemLibmpv() {
  // Same two Homebrew prefixes src-tauri/build.rs already knows about —
  // Apple Silicon vs Intel — picking whichever this runner actually has.
  const candidates = ['/opt/homebrew/lib/libmpv.dylib', '/usr/local/lib/libmpv.dylib'];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `libmpv.dylib not found in ${candidates.join(' or ')} — run \`brew install mpv\` first.`,
    );
  }
  return found;
}

function otoolDependencies(path) {
  // `otool -L <path>` prints a header line (the file itself) followed by one
  // indented "<dep path> (compatibility version ..., current version ...)"
  // line per linked library.
  const output = execFileSync('otool', ['-L', path], { encoding: 'utf8' });
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(' ')[0])
    .filter(Boolean);
}

function homebrewFormulaFromPath(dependencyPath) {
  // Homebrew's own `/<prefix>/opt/<formula>/...` symlink convention embeds
  // the formula name directly in the path, so no separate filename → formula
  // lookup table is needed. Paths without an `/opt/<name>/` segment are
  // system libraries (/usr/lib, /System/Library/...) — not ours to license.
  const match = dependencyPath.match(/\/opt\/([^/]+)\//);
  return match ? match[1] : null;
}

// Breadth-first walk of the full transitive dependency graph starting from
// libmpv itself, collecting every distinct Homebrew formula touched anywhere
// in the closure (mpv -> ffmpeg -> libx264, mpv -> libass -> freetype -> ...).
function collectBundledFormulas(startPath) {
  const formulas = new Set();
  const visited = new Set();
  const queue = [startPath];
  while (queue.length > 0) {
    const current = queue.shift();
    let real;
    try {
      real = realpathSync(current);
    } catch {
      real = current;
    }
    if (visited.has(real)) continue;
    visited.add(real);
    let dependencies;
    try {
      dependencies = otoolDependencies(real);
    } catch {
      continue;
    }
    for (const dependency of dependencies) {
      if (dependency === real) continue;
      const formula = homebrewFormulaFromPath(dependency);
      if (!formula) continue;
      formulas.add(formula);
      if (!visited.has(dependency)) queue.push(dependency);
    }
  }
  return formulas;
}

function brewFormulaInfo(formula) {
  const raw = execFileSync('brew', ['info', '--json=v2', formula], { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  const info = parsed.formulae?.[0];
  if (!info) throw new Error(`\`brew info --json=v2 ${formula}\` returned no formula data.`);
  return {
    name: info.name,
    version: info.versions?.stable ?? 'unknown',
    license: info.license ?? 'UNKNOWN',
    homepage: info.homepage ?? '',
  };
}

const formulas = [...collectBundledFormulas(findSystemLibmpv())].sort();
if (formulas.length === 0) {
  throw new Error(
    'Found zero Homebrew-owned dependencies while walking libmpv — the detection above is ' +
      'almost certainly broken, since mpv always depends on at least ffmpeg and libass.',
  );
}

const entries = formulas.map(brewFormulaInfo);

mkdirSync(outputDir, { recursive: true });
const lines = [
  'MOVENA — MACOS RUNTIME LIBRARY NOTICES',
  '',
  'This build bundles the following native libraries (installed via Homebrew at build',
  'time, then embedded into the app by scripts/bundle-macos-mpv.mjs) so playback works',
  "without a separate `brew install mpv` on the end user's machine. Each entry lists the",
  'library, the version bundled in this build, its license, and its upstream homepage for',
  'source access.',
  '',
  'Do not edit manually. Regenerated by scripts/generate-macos-runtime-licenses.mjs during',
  'the macOS release build.',
  '',
  '='.repeat(78),
  '',
];
for (const entry of entries) {
  lines.push(entry.name, `Version: ${entry.version}`, `License: ${entry.license}`);
  if (entry.homepage) lines.push(`Homepage: ${entry.homepage}`);
  lines.push('');
}

writeFileSync(outputPath, `${lines.join('\n').trimEnd()}\n`, 'utf8');
console.log(`Wrote ${outputPath} (${entries.length} bundled libraries: ${formulas.join(', ')})`);
