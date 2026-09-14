// Runs as Tauri's `beforeBundleCommand` hook on macOS (see
// tauri.bundle.macos.conf.json) — after cargo has compiled the raw
// executable but before Tauri assembles, signs, and (if configured)
// notarizes the .app. Makes the build self-contained: copies libmpv and its
// full transitive dependency closure (ffmpeg, libass, freetype, ...) into a
// staging directory Tauri then bundles as Contents/Frameworks (see this
// config's `resources` entry), and rewrites the executable's own load
// commands to point there — instead of shipping a binary that only launches
// if the end user happens to already have that *exact* set of libraries
// installed via Homebrew at the same prefix the CI runner used. That
// mismatch is what crashed with a dyld "Library not loaded" error for
// anyone using a different mpv install (MacPorts, a different Homebrew
// prefix, or none at all).
//
// Running before bundling — rather than patching the finished .app
// afterwards — means Tauri's own signing (and notarization, if ever
// configured) needs no changes at all: it runs its normal single pass over
// a bundle that is already self-contained by the time it starts, so the
// DMG and the updater .app.tar.gz it produces are correct from the start
// too, with nothing to redo or re-sign on our side for the app bundle
// itself or the main executable.
//
// The bundled dylibs are a different story. They're embedded via a generic
// `bundle.resources` entry (a plain directory copy), not the dedicated
// `bundle.macOS.frameworks` config field — that field needs a static,
// pre-known list of exact file paths at config-parse time, which conflicts
// with discovering the set of libraries dynamically, here, mid-build. The
// cost of that choice is that `bundle.resources` is *only* a copy: reading
// tauri-bundler's own source confirms its final `codesign` call has no
// `--deep` and only signs the exact paths it already knows about (the app
// bundle, `bundle.macOS.frameworks` entries, internal/external binaries) —
// files copied in via `resources` are never added to that list and would
// ship completely unsigned. This signs each dylib itself, ad-hoc, right
// here; a plain file copy afterwards (what `resources` does) preserves an
// already-embedded signature untouched, so they arrive inside the bundle
// already valid by the time Tauri seals the outer app around them.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  console.error('This script only makes sense on macOS.');
  process.exit(1);
}

const projectRoot = resolve(import.meta.dirname, '..');
const executable = join(projectRoot, 'src-tauri', 'target', 'release', 'movena');
const frameworksDir = join(projectRoot, 'src-tauri', 'macos-frameworks');

if (!existsSync(executable)) {
  console.error(
    `Executable not found: ${executable} — this must run as Tauri's beforeBundleCommand, ` +
      'after cargo build has produced it, not stand-alone.',
  );
  process.exit(1);
}

// Re-runnable: a stale directory from a previous build shouldn't mix with
// what dylibbundler is about to collect this time.
rmSync(frameworksDir, { recursive: true, force: true });
mkdirSync(frameworksDir, { recursive: true });

console.log(`Bundling libmpv and its dependencies into ${frameworksDir} ...`);
console.log(
  execFileSync(
    'dylibbundler',
    ['-od', '-b', '-x', executable, '-d', frameworksDir, '-p', '@executable_path/../Frameworks/'],
    { encoding: 'utf8' },
  ),
);

// Sanity check: dylibbundler is expected to have rewritten every reference
// to the CI runner's own Homebrew install to a relative path — if any
// survive, the app would still crash on a machine without that exact
// Homebrew prefix, which is the entire bug this script exists to fix.
const remaining = execFileSync('otool', ['-L', executable], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => /\/(usr\/local|opt\/homebrew)\//.test(line));
if (remaining.length > 0) {
  console.error(
    'Homebrew-absolute paths remain in the executable after bundling:\n' + remaining.join('\n'),
  );
  process.exit(1);
}

const bundledDylibs = readdirSync(frameworksDir).filter((name) => name.endsWith('.dylib'));
if (bundledDylibs.length === 0) {
  throw new Error(
    `dylibbundler produced no .dylib files in ${frameworksDir} — that can't be right.`,
  );
}
console.log(`Ad-hoc signing ${bundledDylibs.length} bundled libraries individually...`);
for (const name of bundledDylibs) {
  execFileSync('codesign', ['--force', '--sign', '-', join(frameworksDir, name)], {
    stdio: 'inherit',
  });
}

console.log(
  'Bundled and signed libmpv and its dependencies — Tauri will copy them into ' +
    'Contents/Frameworks and sign the app around them as usual.',
);
