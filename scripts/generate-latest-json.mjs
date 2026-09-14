// Builds the `latest.json` manifest the Tauri updater plugin polls at
// `<repo>/releases/latest/download/latest.json` (configured in
// `src-tauri/tauri.conf.json`'s `plugins.updater.endpoints`).
//
// Tauri's updater only supports self-updating through one artifact per
// platform: the NSIS installer on Windows, the `.app.tar.gz` on macOS, and
// the AppImage on Linux (not the .msi/.deb/.rpm — those have no update
// mechanism of their own). Each of those bundles gets a `.sig` file
// alongside it during `tauri build` when `bundle.createUpdaterArtifacts` is
// on and the signing secrets are set; this script reads those `.sig`
// contents and wires them into the manifest schema the plugin expects.
//
// Run from the repo root with the release assets already collected into one
// directory (see .github/workflows/release.yml's `publish` job):
//   node scripts/generate-latest-json.mjs <assets-dir>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = process.argv[2];
if (!assetsDir) {
  console.error('Usage: node generate-latest-json.mjs <assets-dir>');
  process.exit(1);
}

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  console.error('GITHUB_REPOSITORY is not set');
  process.exit(1);
}
const tag = `v${version}`;
const downloadUrl = (fileName) => `https://github.com/${repo}/releases/download/${tag}/${fileName}`;

function readSignature(fileName) {
  const path = join(assetsDir, `${fileName}.sig`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').trim();
}

// { platformKey: assetFileName } — the one updatable artifact per platform.
// The two darwin entries come from separate release.yml build-macos matrix
// legs (native aarch64 and x86_64 builds) that rename their otherwise
// identically-named `Movena.app.tar.gz` output to avoid clobbering each
// other once both land in the same release — see that job's packaging step.
const platforms = {
  'windows-x86_64': `Movena_${version}_x64-setup.exe`,
  'darwin-aarch64': 'Movena_aarch64.app.tar.gz',
  'darwin-x86_64': 'Movena_x86_64.app.tar.gz',
  'linux-x86_64': `Movena_${version}_amd64.AppImage`,
};

const manifestPlatforms = {};
for (const [platformKey, fileName] of Object.entries(platforms)) {
  const signature = readSignature(fileName);
  if (!signature) {
    console.warn(
      `No signature found for ${platformKey} (${fileName}.sig) — skipping from latest.json`,
    );
    continue;
  }
  manifestPlatforms[platformKey] = { signature, url: downloadUrl(fileName) };
}

if (Object.keys(manifestPlatforms).length === 0) {
  console.error(
    'No updater signatures found for any platform — refusing to write an empty latest.json',
  );
  process.exit(1);
}

const manifest = {
  version,
  notes: `See https://github.com/${repo}/releases/tag/${tag} for details.`,
  pub_date: new Date().toISOString(),
  platforms: manifestPlatforms,
};

writeFileSync(join(assetsDir, 'latest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote latest.json for ${Object.keys(manifestPlatforms).join(', ')}`);
