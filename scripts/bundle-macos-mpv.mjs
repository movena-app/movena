// Runs as Tauri's `beforeBundleCommand` hook on macOS (see
// tauri.bundle.macos.conf.json) — after cargo has compiled the raw
// executable but before Tauri assembles, signs, and (if configured)
// notarizes the .app. Makes the build self-contained: copies libmpv and its
// full transitive dependency closure (ffmpeg, libass, freetype, ...) into a
// staging directory Tauri then bundles as Contents/Resources/Frameworks (see
// this config's `resources` entry — Tauri's generic resource copier always
// places files under Contents/Resources on macOS, never at the bundle-root
// Contents/Frameworks a plain `resources` value like "Frameworks/" might
// suggest), and rewrites the executable's own load commands to point there
// — instead of shipping a binary that only launches
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
    [
      '-od',
      '-b',
      '-x',
      executable,
      '-d',
      frameworksDir,
      '-p',
      '@executable_path/../Resources/Frameworks/',
    ],
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

// dylibbundler rewrites each of a library's *existing* rpath entries
// individually (`install_name_tool -rpath <old> <new>`), one call per
// original entry. A Homebrew library that shipped with more than one
// distinct rpath (e.g. libmpv linking against two different Swift toolchain
// paths) ends up with every one of them rewritten to the same new value —
// producing duplicate LC_RPATH commands in a single file. Older dyld
// tolerated that; current dyld refuses to load the library at all
// ("Library not loaded ... duplicate LC_RPATH"), which would silently
// re-break the exact crash this script exists to prevent. Collapse any
// duplicates back down to one entry per unique path before signing.
function dedupeRpaths(filePath) {
  const info = execFileSync('otool', ['-l', filePath], { encoding: 'utf8' });
  const rpaths = [...info.matchAll(/cmd LC_RPATH\s*\n\s*cmdsize \d+\s*\n\s*path (.+?) \(offset \d+\)/g)].map(
    (m) => m[1],
  );
  const counts = new Map();
  for (const path of rpaths) counts.set(path, (counts.get(path) ?? 0) + 1);
  for (const [path, count] of counts) {
    // -delete_rpath removes exactly one matching entry per call.
    for (let i = 1; i < count; i++) {
      execFileSync('install_name_tool', ['-delete_rpath', path, filePath]);
    }
  }
}

for (const name of bundledDylibs) {
  dedupeRpaths(join(frameworksDir, name));
}
dedupeRpaths(executable);

console.log(`Ad-hoc signing ${bundledDylibs.length} bundled libraries individually...`);
for (const name of bundledDylibs) {
  execFileSync('codesign', ['--force', '--sign', '-', join(frameworksDir, name)], {
    stdio: 'inherit',
  });
}

console.log(
  'Bundled and signed libmpv and its dependencies — Tauri will copy them into ' +
    'Contents/Resources/Frameworks and sign the app around them as usual.',
);
