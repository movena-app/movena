import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resolverSourceDir = join(projectRoot, 'scripts', 'twitch-resolver');
const buildRoot = join(projectRoot, 'src-tauri', '.twitch-resolver-build');
const outputRoot = join(projectRoot, 'src-tauri', 'lib');
const outputDir = join(outputRoot, 'twitch-resolver');
const venvDir = join(buildRoot, 'venv');
// Prefer the interpreter on PATH so CI and local version managers can select the
// exact pinned patch release. The Windows `py -3` launcher otherwise chooses the
// newest installed Python 3 version and can bypass actions/setup-python.
const python = process.env.MOVENA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const venvPython =
  process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');
const expectedPythonVersion = '3.13.11';

function run(executable, args) {
  execFileSync(executable, args, { cwd: projectRoot, stdio: 'inherit' });
}

function removeGeneratedDirectory(path) {
  const parent = realpathSync(dirname(path));
  const expectedParent = realpathSync(outputRoot);
  if (parent !== expectedParent || path !== outputDir) {
    throw new Error(`Refusing to remove unexpected resolver output: ${path}`);
  }
  rmSync(path, { recursive: true, force: true });
}

mkdirSync(buildRoot, { recursive: true });
mkdirSync(outputRoot, { recursive: true });

if (!existsSync(venvPython)) {
  run(python, ['-m', 'venv', venvDir]);
}

const pythonVersion = execFileSync(
  venvPython,
  ['-c', 'import platform; print(platform.python_version())'],
  {
    encoding: 'utf8',
  },
).trim();
if (pythonVersion !== expectedPythonVersion) {
  throw new Error(
    `The Twitch resolver requires Python ${expectedPythonVersion}, found ${pythonVersion}. ` +
      `Remove ${venvDir} and recreate it with MOVENA_PYTHON pointing to the pinned interpreter.`,
  );
}

run(venvPython, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--require-hashes',
  '--requirement',
  join(resolverSourceDir, 'requirements.lock'),
]);

if (existsSync(outputDir)) removeGeneratedDirectory(outputDir);

run(venvPython, [
  '-m',
  'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onedir',
  '--name',
  'twitch-resolver',
  '--distpath',
  outputRoot,
  '--workpath',
  join(buildRoot, 'work'),
  '--specpath',
  buildRoot,
  '--hidden-import',
  'streamlink.plugins.twitch',
  '--collect-data',
  'streamlink',
  '--copy-metadata',
  'streamlink',
  join(resolverSourceDir, 'main.py'),
]);

const executable = join(
  outputDir,
  process.platform === 'win32' ? 'twitch-resolver.exe' : 'twitch-resolver',
);
if (!existsSync(executable)) throw new Error('The Twitch resolver executable was not generated.');
if (process.platform !== 'win32') chmodSync(executable, 0o755);
run(process.execPath, [join(projectRoot, 'scripts', 'generate-third-party-licenses.mjs')]);
copyFileSync(
  join(projectRoot, 'THIRD_PARTY_LICENSES.txt'),
  join(outputDir, 'THIRD_PARTY_NOTICES.txt'),
);

const bundledNames = readdirSync(outputDir, { recursive: true }).map((value) =>
  String(value).toLowerCase(),
);
if (bundledNames.some((value) => /(^|[\\/])ffmpeg(?:\.exe)?$/.test(value))) {
  throw new Error('The Twitch resolver must not bundle FFmpeg.');
}

const version = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
if (version !== '8.5.0') throw new Error(`Unexpected Streamlink version: ${version}`);

run(executable, ['--can-handle-url', 'https://www.twitch.tv/gleggmire']);
console.log(
  `[build-twitch-resolver] Built Streamlink ${version} with Python ${pythonVersion} at ${outputDir}`,
);
