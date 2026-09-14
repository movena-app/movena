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

function pythonPackages() {
  const resolverRoot = join(projectRoot, 'src-tauri', '.twitch-resolver-build');
  const python =
    process.platform === 'win32'
      ? join(resolverRoot, 'venv', 'Scripts', 'python.exe')
      : join(resolverRoot, 'venv', 'bin', 'python');
  if (!existsSync(python)) {
    throw new Error('The pinned Twitch resolver environment is missing. Run: npm run setup:twitch');
  }
  const lockText = readFileSync(
    join(projectRoot, 'scripts', 'twitch-resolver', 'requirements.lock'),
    'utf8',
  );
  const bundledNames = new Set(
    [...lockText.matchAll(/^([a-z0-9][a-z0-9._-]*)==/gim)].map((match) =>
      match[1].toLowerCase().replaceAll('_', '-'),
    ),
  );
  const collector = String.raw`
import importlib.metadata
import json
import pathlib
import re
import sys

pattern = re.compile(r"^(?:copying|copyright|licen[cs]e|notice)(?:\..+)?$", re.I)
records = []
license_overrides = {
    "pyinstaller-hooks-contrib": "GPL-2.0-or-later AND Apache-2.0",
    "trio-websocket": "MIT",
}
for distribution in importlib.metadata.distributions():
    name = distribution.metadata.get("Name")
    if not name:
        continue
    files = []
    for entry in distribution.files or []:
        path = pathlib.Path(distribution.locate_file(entry))
        if not path.is_file() or not pattern.match(path.name) or path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        files.append({"name": path.name, "text": text})
    records.append({
        "name": name,
        "version": distribution.version,
        "license": (
            distribution.metadata.get("License-Expression")
            or distribution.metadata.get("License")
            or license_overrides.get(name.lower())
            or "UNKNOWN"
        ),
        "files": files,
    })

python_license = pathlib.Path(sys.base_prefix) / "LICENSE.txt"
if python_license.is_file():
    records.append({
        "name": "Python",
        "version": ".".join(map(str, sys.version_info[:3])),
        "license": "Python-2.0",
        "files": [{"name": "LICENSE.txt", "text": python_license.read_text(encoding="utf-8")}],
    })
print(json.dumps(records))
`;
  const records = JSON.parse(
    execFileSync(python, ['-c', collector], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  return records
    .filter(
      (record) =>
        record.name === 'Python' ||
        bundledNames.has(record.name.toLowerCase().replaceAll('_', '-')),
    )
    .map((record) => ({
      ecosystem: 'python',
      key: `${record.name}@${record.version}`,
      license: String(record.license || 'UNKNOWN'),
      files: record.files
        .map((file) => ({ name: file.name, text: normalizeText(file.text) }))
        .filter((file) => file.text.length > 0),
    }));
}

const packages = [
  ...npmPackages(),
  ...cargoPackages(),
  ...nativePackages(),
  ...pythonPackages(),
].sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.key.localeCompare(b.key));

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
