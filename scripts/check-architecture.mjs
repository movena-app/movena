import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const rootArgument = process.argv.indexOf('--root');
const sourceRoot = path.resolve(
  rootArgument >= 0 ? process.argv[rootArgument + 1] : path.join(projectRoot, 'src'),
);
const slash = (value) => value.replaceAll('\\', '/');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = walk(sourceRoot).filter((file) => /\.(ts|tsx)$/.test(file));
const fileSet = new Set(files.map((file) => path.resolve(file)));
const errors = [];
const graph = new Map(files.map((file) => [path.resolve(file), []]));

function resolveImport(source, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return undefined;
  const base = specifier.startsWith('@/')
    ? path.join(sourceRoot, specifier.slice(2))
    : path.resolve(path.dirname(source), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    const resolved = path.resolve(candidate);
    if (fileSet.has(resolved)) return resolved;
  }
  return undefined;
}

function layer(relative) {
  const parts = slash(relative).split('/');
  return parts[0] === 'modules' ? `modules/${parts[1] ?? ''}` : parts[0];
}

for (const file of files) {
  const relative = slash(path.relative(sourceRoot, file));
  const sourceLayer = layer(relative);
  if (!/^(app|shared|platform|modules\/[^/]+)$/.test(sourceLayer)) {
    errors.push(`${relative}: source files must live in app, modules, platform, or shared`);
  }

  const content = fs.readFileSync(file, 'utf8');
  const specifiers = new Set();
  for (const match of content.matchAll(
    /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  )) {
    specifiers.add(match[1]);
  }
  for (const match of content.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(match[1]);
  }
  // Public contracts are checked as boundaries but their re-export table is
  // not a runtime dependency edge for cycle analysis. Consumers create the
  // dependency by importing a named contract; bundlers can then tree-shake
  // unrelated re-exports instead of turning every module API into a clique.
  const reExportSpecifiers = [
    ...content.matchAll(/\bexport\s+(?:type\s+)?[^'";]+?\s+from\s+['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);

  for (const specifier of specifiers) {
    if (specifier.startsWith('@tauri-apps/') && sourceLayer !== 'platform') {
      errors.push(`${relative}: direct Tauri import must stay inside platform`);
    }
    const target = resolveImport(file, specifier);
    if (!target) continue;
    graph.get(path.resolve(file)).push(target);
    const targetRelative = slash(path.relative(sourceRoot, target));
    const targetLayer = layer(targetRelative);

    if (sourceLayer === 'shared' && targetLayer !== 'shared') {
      errors.push(`${relative}: shared cannot import ${targetRelative}`);
    }
    if (sourceLayer === 'platform' && !['platform', 'shared'].includes(targetLayer)) {
      errors.push(`${relative}: platform cannot import ${targetRelative}`);
    }
    if (
      sourceLayer.startsWith('modules/') &&
      targetLayer.startsWith('modules/') &&
      sourceLayer !== targetLayer &&
      !targetRelative.match(/^modules\/[^/]+\/public(?:\.ts|\/)/)
    ) {
      errors.push(`${relative}: cross-module imports must use ${targetLayer}/public.ts`);
    }
  }

  for (const specifier of reExportSpecifiers) {
    const target = resolveImport(file, specifier);
    if (!target) continue;
    const targetRelative = slash(path.relative(sourceRoot, target));
    const targetLayer = layer(targetRelative);
    if (sourceLayer === 'shared' && targetLayer !== 'shared') {
      errors.push(`${relative}: shared cannot re-export ${targetRelative}`);
    }
    if (sourceLayer === 'platform' && !['platform', 'shared'].includes(targetLayer)) {
      errors.push(`${relative}: platform cannot re-export ${targetRelative}`);
    }
    if (relative.match(/^modules\/[^/]+\/public\//)) {
      graph.get(path.resolve(file)).push(target);
    }
  }
}

const visiting = new Set();
const visited = new Set();
const stack = [];
const reportedCycles = new Set();

function visit(file) {
  if (visiting.has(file)) {
    const start = stack.indexOf(file);
    const cycle = [...stack.slice(start), file].map((entry) =>
      slash(path.relative(sourceRoot, entry)),
    );
    const signature = [...new Set(cycle.slice(0, -1))].sort().join('|');
    if (!reportedCycles.has(signature)) {
      reportedCycles.add(signature);
      errors.push(`dependency cycle: ${cycle.join(' -> ')}`);
    }
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  stack.push(file);
  for (const target of graph.get(file) ?? []) visit(target);
  stack.pop();
  visiting.delete(file);
  visited.add(file);
}

for (const file of graph.keys()) visit(file);

if (errors.length > 0) {
  console.error(`Architecture check failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed (${files.length} TypeScript files, zero cycles).`);
}
