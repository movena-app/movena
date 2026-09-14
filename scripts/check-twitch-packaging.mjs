import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');

const lock = source('scripts/twitch-resolver/requirements.lock');
const wrapper = source('scripts/twitch-resolver/main.py');
const builder = source('scripts/build-twitch-resolver.mjs');

assert.match(
  lock,
  /streamlink==8\.5\.0[\s\S]*--hash=sha256:/,
  'Streamlink must remain hash-pinned',
);
assert.ok(
  builder.includes("expectedPythonVersion = '3.13.11'"),
  'The resolver Python version changed',
);

for (const argument of [
  '--no-config',
  '--no-plugin-sideloading',
  '--webbrowser-headless=yes',
  '--player-external-http',
  '--player-external-http-interface=127.0.0.1',
  '--player-external-http-port=0',
  '--player-external-http-continuous=no',
  '--twitch-supported-codecs=h264',
]) {
  assert.ok(wrapper.includes(`"${argument}"`), `Missing safe resolver argument: ${argument}`);
}

assert.ok(!wrapper.includes('--player-passthrough'), 'Player passthrough must stay disabled');
assert.ok(!wrapper.includes('--twitch-low-latency'), 'Twitch low-latency mode must stay disabled');
assert.ok(
  builder.indexOf('generate-third-party-licenses.mjs') < builder.indexOf('THIRD_PARTY_NOTICES.txt'),
  'License generation must run before notices are copied',
);

for (const config of [
  'src-tauri/tauri.bundle.windows.conf.json',
  'src-tauri/tauri.bundle.macos.conf.json',
  'src-tauri/tauri.bundle.linux.conf.json',
]) {
  const parsed = JSON.parse(source(config));
  assert.equal(
    parsed.bundle?.resources?.['lib/twitch-resolver/'],
    'twitch-resolver/',
    `${config} must bundle the resolver runtime`,
  );
}

const report = source('THIRD_PARTY_LICENSES.txt');
for (const licenseEntry of [
  'native:Unlicense',
  'yt-dlp@2026.08.19',
  'python:GPL-2.0-or-later AND Apache-2.0',
  'pyinstaller-hooks-contrib@2026.7',
  'python:MIT',
  'trio-websocket@0.12.2',
]) {
  assert.ok(report.includes(licenseEntry), `Missing resolver license entry: ${licenseEntry}`);
}
assert.ok(!report.includes('python:UNKNOWN'), 'Resolver licenses must not contain unknown entries');

console.log('Twitch resolver packaging check passed.');
