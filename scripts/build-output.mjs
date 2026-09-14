import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const buildOutputDirectory = resolve(projectRoot, 'dist');
const allowedExtensions = new Set(['.css', '.html', '.js', '.png', '.svg', '.txt', '.woff2']);

function assertCleanBuildDirectory(directory) {
  const resolved = resolve(directory);
  if (resolved !== buildOutputDirectory || resolve(resolved, '..') !== projectRoot) {
    throw new Error(`Refusing to operate on unexpected build directory: ${resolved}`);
  }
  return resolved;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function cleanBuildOutput(directory = buildOutputDirectory) {
  const resolved = assertCleanBuildDirectory(directory);
  if (existsSync(resolved)) rmSync(resolved, { recursive: true, force: true });
}

export function validateBuildOutput(directory = buildOutputDirectory) {
  const resolved = resolve(directory);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error('Build output is missing. Run the Vite build first.');
  }
  const relativeFiles = walk(resolved).map((path) =>
    relative(resolved, path).replaceAll('\\', '/'),
  );
  if (!relativeFiles.includes('index.html'))
    throw new Error('Build output does not contain index.html.');
  const unexpected = relativeFiles.filter(
    (path) => !allowedExtensions.has(extname(path).toLowerCase()),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Build output contains unexpected file types:\n${unexpected.map((path) => `- ${path}`).join('\n')}`,
    );
  }
  return relativeFiles;
}

const mode = process.argv[2];
if (mode === 'clean') {
  cleanBuildOutput();
  console.log('Cleaned dist/.');
} else if (mode === 'check') {
  const files = validateBuildOutput(process.argv[3] ?? buildOutputDirectory);
  console.log(`Build-output check passed (${files.length} files).`);
} else if (mode !== undefined) {
  throw new Error(`Unknown build-output mode: ${mode}`);
}
