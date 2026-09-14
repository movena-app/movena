import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(root, 'src');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(sourceRoot).filter((path) =>
  ['.css', '.ts', '.tsx'].includes(extname(path)),
);
const cssFiles = sourceFiles.filter((path) => extname(path) === '.css');
const tokenSource = join(sourceRoot, 'shared', 'design', 'index.css');
const violations = [];
const globalLayerTokens = new Set([
  '--z-sidebar',
  '--z-header',
  '--z-window-drag',
  '--z-modal',
  '--z-dropdown',
  '--z-toast',
  '--z-player-backdrop',
  '--z-player',
  '--z-player-controls',
  '--z-window-chrome',
  '--z-player-prompt',
  '--z-player-popover',
  '--z-player-drag',
  '--z-debug',
  '--z-context-menu',
  '--z-context-submenu',
]);

function report(path, rule, match) {
  const content = readFileSync(path, 'utf8');
  const line = content.slice(0, match.index).split(/\r?\n/).length;
  violations.push(`${relative(root, path)}:${line} ${rule}: ${match[0].trim()}`);
}

for (const path of cssFiles) {
  const content = readFileSync(path, 'utf8');
  try {
    postcss.parse(content, { from: path });
  } catch (err) {
    violations.push(
      `${relative(root, path)}:${err.line || 1}:${err.column || 1} CSS syntax error: ${err.reason || err.message}`,
    );
  }
  if (path === tokenSource) continue;
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [
    ['literal color', /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(\s*\d/gi],
    ['literal color alpha', /rgba\(\s*var\([^)]*-rgb\)\s*,\s*[0-9.]/gi],
    ['literal font weight', /font-weight\s*:\s*\d{3}\b/gi],
    ['literal font size', /font-size\s*:[^;]*\b\d+(?:\.\d+)?(?:px|rem|em)\b/gi],
    ['literal opacity', /opacity\s*:\s*(?:0?\.\d+|1\.0+)\b/gi],
    [
      'literal spacing',
      /(?:(?:row-|column-)?gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?)\s*:[^;]*-?\d+(?:\.\d+)?px\b/gi,
    ],
    ['literal radius', /border-radius\s*:[^;]*\b\d+(?:\.\d+)?px\b/gi],
    ['literal motion duration', /\b(?!0s\b)\d+(?:\.\d+)?(?:ms|s)\b/gi],
    ['literal easing curve', /cubic-bezier\(/gi],
    [
      'literal easing keyword',
      /(?:transition|animation)\s*:[^;]*\s(?:ease(?:-in(?:-out)?|-out)?)(?=[\s,;])/gi,
    ],
    ['transition all is unstable; enumerate the animated properties', /transition\s*:\s*all\b/gi],
  ];

  for (const [name, pattern] of rules) {
    for (const match of withoutComments.matchAll(pattern)) report(path, name, match);
  }

  for (const match of withoutComments.matchAll(/box-shadow\s*:\s*([^;]+)/gi)) {
    const value = match[1].trim();
    if (!value.startsWith('var(') && !value.startsWith('none')) {
      report(path, 'non-token shadow', match);
    }
  }

  for (const match of withoutComments.matchAll(/z-index\s*:\s*(\d+)/gi)) {
    if (Number(match[1]) >= 50) report(path, 'global layer must use a z-index token', match);
  }
  for (const match of withoutComments.matchAll(/z-index\s*:\s*calc\([^;]*--z-[^;]+/gi)) {
    report(path, 'global layer calculations are forbidden; declare a named layer token', match);
  }
  for (const match of withoutComments.matchAll(/z-index\s*:\s*var\(\s*(--z-[\w-]+)/gi)) {
    if (!globalLayerTokens.has(match[1])) report(path, 'undeclared global layer token', match);
  }

  if (relative(sourceRoot, path).replaceAll('\\', '/').startsWith('modules/playback/')) {
    for (const match of withoutComments.matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;]+)/gi)) {
      if (match[1].trim() !== 'none')
        report(path, 'player surfaces cannot use backdrop-filter', match);
    }
  }

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1];
    const body = match[2];
    if (
      /(?:button|btn|primary)/i.test(selector) &&
      /background(?:-color)?\s*:\s*var\(--accent-color\)/i.test(body)
    ) {
      report(path, 'controls cannot use a solid accent background', match);
    }
    if (
      /(?:active|selected|current)/i.test(selector) &&
      /border-(?:top|right|bottom|left)\s*:[^;]*var\(--accent-color\)/i.test(body)
    ) {
      report(path, 'selection state cannot use a one-sided accent border', match);
    }
  }
}

for (const path of sourceFiles.filter((sourcePath) =>
  ['.ts', '.tsx'].includes(extname(sourcePath)),
)) {
  const content = readFileSync(path, 'utf8');
  for (const match of content.matchAll(/ease\s*:\s*['"]ease(?:In|Out|InOut)['"]/g)) {
    report(path, 'Framer easing must use src/shared/design/motion.ts', match);
  }

  if (extname(path) !== '.tsx') continue;
  for (const match of content.matchAll(
    /(?:opacity|fontWeight|fontSize|borderRadius)\s*:\s*(?:0?\.\d+|\d{2,})\b/g,
  )) {
    report(path, 'inline visual values must use design tokens or CSS classes', match);
  }

  const sourcePath = relative(sourceRoot, path).replaceAll('\\', '/');
  const ownsModalPrimitive =
    sourcePath === 'shared/ui/DialogShell.tsx' ||
    sourcePath === 'modules/catalog/components/DetailsDialogShell.tsx';
  if (
    /aria-modal\s*=\s*["{]true/.test(content) &&
    !ownsModalPrimitive &&
    !/<(?:DialogShell|DetailsDialogShell)\b/.test(content)
  ) {
    report(path, 'modal surfaces must compose a shared portal modal primitive', {
      0: 'aria-modal="true"',
      index: content.search(/aria-modal\s*=\s*["{]true/),
    });
  }
  const isPlayerSource =
    sourcePath.startsWith('modules/playback/') ||
    sourcePath === 'modules/playback/hooks/usePlayerContextMenus.tsx';
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const reportNode = (rule, node) =>
    report(path, rule, {
      0: node.getText(sourceFile),
      index: node.getStart(sourceFile),
    });
  const visitJsx = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const attribute = (name) =>
        node.attributes.properties.find(
          (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
        );

      if (tagName === 'video') reportNode('native video fallback is forbidden', node);
      if (tagName === 'select') reportNode('use the shared Select component', node);
      if (tagName === 'button' && !attribute('type')) {
        reportNode('native buttons need an explicit type', node);
      }
      if (tagName === 'input') {
        const typeAttribute = attribute('type');
        const initializer =
          typeAttribute && ts.isJsxAttribute(typeAttribute) ? typeAttribute.initializer : undefined;
        const type = initializer && ts.isStringLiteral(initializer) ? initializer.text : undefined;
        const hasDynamicType = initializer && !ts.isStringLiteral(initializer);
        const isTextField =
          !hasDynamicType &&
          (!type || ['email', 'password', 'search', 'text', 'url'].includes(type));
        const classAttribute = attribute('className');
        if (
          isTextField &&
          (!classAttribute || !/\buiField\b/.test(classAttribute.getText(sourceFile)))
        ) {
          reportNode('text fields must compose the shared uiField', node);
        }
      }
      if (isPlayerSource && /^[a-z]/.test(tagName) && attribute('title')) {
        reportNode('player controls use aria-label instead of native title tooltips', node);
      }
    }
    ts.forEachChild(node, visitJsx);
  };
  visitJsx(sourceFile);

  if (isPlayerSource) {
    const forbiddenLucideIcons = new Set([
      'Maximize',
      'Maximize2',
      'Minimize',
      'Minimize2',
      'Pause',
      'Play',
      'SkipForward',
      'StepForward',
      'Volume1',
      'Volume2',
      'VolumeX',
    ]);
    for (const match of content.matchAll(
      /import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"]/g,
    )) {
      const imports = match[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0]);
      const drift = imports.filter((name) => forbiddenLucideIcons.has(name));
      if (drift.length > 0) {
        report(path, `stateful player icons must use Remix (${drift.join(', ')})`, match);
      }
    }
  }

  if (sourcePath === 'components/layout/CategorySidebar.tsx') {
    for (const match of content.matchAll(
      /import\s*\{[\s\S]*?\bLayoutGrid\b[\s\S]*?\}\s*from\s*['"]lucide-react['"]/g,
    )) {
      report(path, 'navigation icons must use Remix line/fill pairs', match);
    }
  }
}

const referencedCssModules = new Set();
const cssModuleUsages = new Map();
const dynamicCssModuleAllowances = new Map([
  ['shared/ui/SegmentedControl.module.css', new Set(['md', 'sm'])],
  [
    'modules/diagnostics/components/DebugOverlay.module.css',
    new Set(['debug', 'error', 'info', 'warn']),
  ],
  ['shared/ui/ToastContainer.module.css', new Set(['error', 'info', 'success', 'warning'])],
  ['modules/guide/components/UpcomingReleaseCard.module.css', new Set(['discover', 'schedule'])],
  [
    'modules/downloads/pages/DownloadsPage.module.css',
    new Set([
      'statuscompleted',
      'statusdownloading',
      'statusfailed',
      'statuspaused',
      'statusqueued',
    ]),
  ],
]);
for (const path of sourceFiles.filter((sourcePath) =>
  ['.ts', '.tsx'].includes(extname(sourcePath)),
)) {
  const content = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (!statement.moduleSpecifier.text.endsWith('.module.css')) continue;
    const cssPath = statement.moduleSpecifier.text.startsWith('@/')
      ? resolve(sourceRoot, statement.moduleSpecifier.text.slice(2))
      : resolve(dirname(path), statement.moduleSpecifier.text);
    referencedCssModules.add(cssPath);
    const localName = statement.importClause?.name?.text;
    if (!localName) continue;
    const usages = cssModuleUsages.get(cssPath) ?? new Set();
    const visit = (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === localName
      ) {
        usages.add(node.name.text);
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === localName
      ) {
        const argument = node.argumentExpression;
        if (
          argument &&
          (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
        ) {
          usages.add(argument.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    cssModuleUsages.set(cssPath, usages);
  }
}
for (const path of cssFiles.filter((cssPath) => cssPath.endsWith('.module.css'))) {
  if (!referencedCssModules.has(resolve(path))) {
    report(path, 'orphan CSS module', { 0: relative(root, path), index: 0 });
    continue;
  }
  const used = cssModuleUsages.get(resolve(path)) ?? new Set();
  const relativeCssPath = relative(sourceRoot, path).replaceAll('\\', '/');
  const allowed = dynamicCssModuleAllowances.get(relativeCssPath) ?? new Set();
  const content = readFileSync(path, 'utf8');
  const withoutGlobals = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:global\([^)]*\)/g, '');
  const seen = new Set();
  for (const match of withoutGlobals.matchAll(/\.([_a-zA-Z][\w-]*)/g)) {
    const className = match[1];
    if (seen.has(className)) continue;
    seen.add(className);
    if (!used.has(className) && !allowed.has(className)) {
      report(path, `unused CSS-module selector .${className}`, match);
    }
  }
}

const definitions = new Set();
const tokenDefinitionLocations = new Map();
const usages = [];
for (const path of sourceFiles) {
  const content = readFileSync(path, 'utf8');
  if (extname(path) === '.css') {
    for (const match of content.matchAll(/(--[\w-]+)\s*:/g)) {
      definitions.add(match[1]);
      if (path === tokenSource && !tokenDefinitionLocations.has(match[1])) {
        tokenDefinitionLocations.set(match[1], { path, index: match.index });
      }
    }
  }
  for (const match of content.matchAll(/['"](--[\w-]+)['"]\s*:/g)) definitions.add(match[1]);
  for (const match of content.matchAll(/var\(\s*(--[\w-]+)/g)) {
    usages.push({ path, token: match[1], index: match.index });
  }
  for (const match of content.matchAll(
    /(?:getPropertyValue|setProperty)\(\s*['"](--[\w-]+)['"]/g,
  )) {
    usages.push({ path, token: match[1], index: match.index });
  }
}

for (const usage of usages) {
  if (!definitions.has(usage.token)) {
    report(usage.path, `undefined design token ${usage.token}`, {
      0: `var(${usage.token})`,
      index: usage.index,
    });
  }
}

if (violations.length > 0) {
  console.error(`Design-system check failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

const usedTokens = new Set(usages.map(({ token }) => token));
for (const [token, location] of tokenDefinitionLocations) {
  if (!usedTokens.has(token)) {
    report(location.path, `unused design token ${token}`, { 0: token, index: location.index });
  }
}

console.log(
  `Design-system check passed (${cssFiles.length} stylesheets, ${definitions.size} tokens).`,
);
