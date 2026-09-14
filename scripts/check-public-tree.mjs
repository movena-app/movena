import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const output = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: projectRoot, encoding: 'utf8' },
);
const files = output
  .split('\0')
  .filter(Boolean)
  .filter((file) => existsSync(resolve(projectRoot, file)));
const publishableRoots = ['public', 'docs', 'src-tauri/dmg', 'src-tauri/icons', 'src-tauri/msix'];
const ignoredPublishableOutput = execFileSync(
  'git',
  ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...publishableRoots],
  { cwd: projectRoot, encoding: 'utf8' },
);
const ignoredPublishableFiles = ignoredPublishableOutput.split('\0').filter(Boolean);
const failures = [];
const playlistExtensions = new Set(['.m3u', '.m3u8', '.xspf', '.xmltv']);
const binaryMediaExtensions = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.mp3', '.flac']);
const allowedPlaylist = /^tests\/fixtures\/[a-z0-9._-]+\.m3u8?$/i;
const secretPatterns = [
  ['private key', /-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED) )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['AWS temporary access key', /\bASIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['OpenAI API key', /\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}\b/],
  ['Stripe secret key', /\bsk_(?:live|test)_[0-9A-Za-z]{20,}\b/],
  ['npm authentication token', /(?:^|\n)\s*\/\/[^\s:]+\/:_authToken\s*=\s*[^\s${}][^\s]*/i],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  [
    'hardcoded credential',
    /\b(?:api[_-]?key|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_+\/=.-]{16,}['"]/i,
  ],
];
const credentialUrlPattern = /https?:\/\/[^\s"'<>]+/gi;
const reservedFixtureHost = /(?:^|\.)(?:example(?:\.com|\.net|\.org)?|test|invalid)$/i;
const reservedFixtureUser = /^(?:test|viewer|example)$/i;
const personalPathPatterns = [
  /[A-Za-z]:[\\/]+Users[\\/]+([^\\/\s"'<>]+)(?:[\\/][^\s"'<>]*)?/gi,
  /\/(?:Users|home)\/([^/\s"'<>]+)(?:\/[^\s"'<>]*)?/gi,
];
const skippedLocalDirectories = new Set([
  '.git',
  '.offline-markdown-preview',
  'coverage',
  'coverage-m3u',
  'dist',
  'node_modules',
  'playwright-report',
  'target',
  'test-results',
]);
const skippedGeneratedPrefixes = [
  'src-tauri/.twitch-resolver-build/',
  'src-tauri/lib/twitch-resolver/',
];
const sensitiveLocalName =
  /^(?:\.env(?:\..+)?|\.npmrc|\.pypirc|\.netrc|_netrc|id_rsa.*|id_ed25519.*|tauri-signing-key.*|credentials\.json|secrets\.(?:json|ya?ml|toml))$/i;
const sensitiveLocalExtension = new Set(['.key', '.p12', '.pem', '.pfx']);

function hasEncodedPrivateKey(text) {
  for (const match of text.matchAll(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g)) {
    try {
      const decoded = Buffer.from(match[0], 'base64').toString('utf8');
      if (/\b(?:encrypted\s+)?secret key\b/i.test(decoded)) return true;
    } catch {
      // Not valid base64; the regular secret patterns still apply.
    }
  }
  return false;
}

function isCredentialUrl(value) {
  try {
    const parsed = new URL(value);
    if (reservedFixtureHost.test(parsed.hostname)) return false;
    if (parsed.username || parsed.password) return true;
    return [...parsed.searchParams.keys()].some((key) =>
      /^(?:api[_-]?key|password|passwd|secret|token|username)$/i.test(key),
    );
  } catch {
    return false;
  }
}

function inspectLocalArtifacts(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedLocalDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    const normalized = relative(projectRoot, absolute).replace(/\\/g, '/');
    if (skippedGeneratedPrefixes.some((prefix) => `${normalized}/`.startsWith(prefix))) continue;
    if (entry.isDirectory()) {
      inspectLocalArtifacts(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    if (
      normalized === '.env.example' ||
      normalized.endsWith('.example.json') ||
      normalized === '.npmrc.example'
    )
      continue;
    if (
      sensitiveLocalName.test(basename(normalized)) ||
      sensitiveLocalExtension.has(extname(normalized).toLowerCase())
    ) {
      failures.push(
        `${normalized}: sensitive local credential/signing artifact must live outside the repository`,
      );
    }
  }
}

for (const file of files) {
  const normalized = file.replace(/\\/g, '/');
  const extension = extname(normalized).toLowerCase();
  if (playlistExtensions.has(extension) && !allowedPlaylist.test(normalized)) {
    failures.push(`${normalized}: private playlist formats are not permitted`);
  }
  if (binaryMediaExtensions.has(extension)) {
    failures.push(`${normalized}: bundled audio/video requires an explicit release exception`);
  }
  const absolute = resolve(projectRoot, file);
  if (statSync(absolute).size > 2 * 1024 * 1024) continue;
  let text;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch {
    continue;
  }
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) failures.push(`${relative(projectRoot, absolute)}: possible ${label}`);
  }
  if (hasEncodedPrivateKey(text)) {
    failures.push(`${relative(projectRoot, absolute)}: possible base64-encoded private key`);
  }
  for (const pattern of personalPathPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (!reservedFixtureUser.test(match[1])) {
        failures.push(`${relative(projectRoot, absolute)}: possible personal filesystem path`);
        break;
      }
    }
  }
  for (const match of text.matchAll(credentialUrlPattern)) {
    if (isCredentialUrl(match[0])) {
      failures.push(`${relative(projectRoot, absolute)}: possible credential-bearing URL`);
      break;
    }
  }
}

for (const file of ignoredPublishableFiles) {
  const normalized = file.replace(/\\/g, '/');
  const extension = extname(normalized).toLowerCase();
  if (playlistExtensions.has(extension)) {
    failures.push(
      `${normalized}: ignored private playlist is inside a publishable source directory`,
    );
  }
  if (binaryMediaExtensions.has(extension)) {
    failures.push(`${normalized}: ignored audio/video is inside a publishable source directory`);
  }
}

inspectLocalArtifacts(projectRoot);

if (failures.length) {
  console.error(
    'Public-tree compliance check failed:\n' + failures.map((item) => `- ${item}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `Public-tree compliance check passed (${files.length} visible files; ${ignoredPublishableFiles.length} ignored publishable files inspected).`,
);
