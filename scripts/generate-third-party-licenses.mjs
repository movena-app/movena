import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputPath = join(projectRoot, 'THIRD_PARTY_LICENSES.txt');
const checkOnly = process.argv.includes('--check');
const licenseFilePattern = /^(?:copying|copyright|licen[cs]e|notice)(?:\..+)?$/i;

function normalizeText(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function readLicenseFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenseFilePattern.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name,
      text: normalizeText(readFileSync(join(directory, entry.name), 'utf8')),
    }))
    .filter((entry) => entry.text.length > 0);
}

function npmPackages() {
  const lock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8'));
  const found = new Map();
  for (const [packagePath, locked] of Object.entries(lock.packages ?? {})) {
    if (!packagePath || !packagePath.includes('node_modules/') || !locked?.version) continue;
    const directory = join(projectRoot, packagePath);
    if (!existsSync(join(directory, 'package.json'))) continue;
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    const name = manifest.name;
    if (!name || name === 'movena') continue;
    const key = `${name}@${locked.version}`;
    found.set(key, {
      ecosystem: 'npm',
      key,
      license: String(manifest.license ?? locked.license ?? 'UNKNOWN'),
      files: readLicenseFiles(directory),
    });
  }
  return [...found.values()];
}

function cargoPackages() {
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--locked',
        '--format-version',
        '1',
        '--manifest-path',
        join(projectRoot, 'src-tauri', 'Cargo.toml'),
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    ),
  );
  return metadata.packages
    .filter((pkg) => pkg.source && pkg.name !== 'movena')
    .map((pkg) => ({
      ecosystem: 'cargo',
      key: `${pkg.name}@${pkg.version}`,
      license: String(pkg.license ?? 'UNKNOWN'),
      files: readLicenseFiles(dirname(pkg.manifest_path)),
    }));
}

function nativePackages() {
  return [
    {
      ecosystem: 'native',
      key: 'yt-dlp@2026.08.19',
      license: 'Unlicense',
      files: [
        {
          name: 'UNLICENSE',
          text: normalizeText(
            readFileSync(join(projectRoot, 'scripts', 'licenses', 'yt-dlp-UNLICENSE.txt'), 'utf8'),
          ),
        },
      ],
    },
  ];
}

const packages = [...npmPackages(), ...cargoPackages(), ...nativePackages()].sort(
  (a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.key.localeCompare(b.key),
);

const grouped = new Map();
for (const pkg of packages) {
  const key = `${pkg.ecosystem}:${pkg.license}`;
  const values = grouped.get(key) ?? [];
  values.push(pkg.key);
  grouped.set(key, values);
}

const uniqueTexts = new Map();
for (const pkg of packages) {
  for (const file of pkg.files) {
    const hash = createHash('sha256').update(file.text).digest('hex');
    const existing = uniqueTexts.get(hash) ?? { text: file.text, usedBy: [] };
    existing.usedBy.push(`${pkg.ecosystem}:${pkg.key} (${file.name})`);
    uniqueTexts.set(hash, existing);
  }
}

const lines = [
  'MOVENA THIRD-PARTY LICENSE REPORT',
  'Generated from package-lock.json, Cargo.lock metadata, pinned native components, and installed license files.',
  'Do not edit manually. Run: npm run licenses:generate',
  '',
  'PACKAGE LICENSE INDEX',
  '=====================',
  '',
];

for (const [group, names] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(group, '-'.repeat(group.length), ...names.map((name) => `- ${name}`), '');
}

lines.push('LICENSE AND NOTICE TEXTS', '========================', '');
for (const [hash, entry] of [...uniqueTexts].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(
    `SHA-256: ${hash}`,
    'Used by:',
    ...entry.usedBy.sort().map((name) => `- ${name}`),
    '',
    entry.text,
    '',
    '='.repeat(78),
    '',
  );
}

const generated = `${lines.join('\n').trimEnd()}\n`;
if (checkOnly) {
  if (
    !existsSync(outputPath) ||
    readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n') !== generated
  ) {
    console.error('THIRD_PARTY_LICENSES.txt is missing or stale. Run npm run licenses:generate.');
    process.exit(1);
  }
  console.log(
    `Third-party license report is current (${packages.length} packages, ${uniqueTexts.size} unique texts).`,
  );
} else {
  writeFileSync(outputPath, generated, 'utf8');
  console.log(
    `Wrote THIRD_PARTY_LICENSES.txt (${packages.length} packages, ${uniqueTexts.size} unique texts).`,
  );
}
