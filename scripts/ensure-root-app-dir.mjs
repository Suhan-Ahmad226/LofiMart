import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const srcAppDir = path.join(projectRoot, 'src', 'app');
const rootAppDir = path.join(projectRoot, 'app');
const rootIndexCssPath = path.join(projectRoot, 'index.css');
const rootTypesPath = path.join(projectRoot, 'types.ts');
const srcLibDir = path.join(projectRoot, 'src', 'lib');
const rootLibDir = path.join(projectRoot, 'lib');
const compatibilityLinks = [
  ['components', 'src/components'],
  ['context', 'src/context'],
  ['data', 'src/data'],
  ['events', 'src/events'],
  ['hooks', 'src/hooks'],
  ['lib', 'src/lib'],
  ['modules', 'src/modules'],
  ['screens', 'src/screens'],
  ['server', 'src/server'],
  ['services', 'src/services'],
  ['types', 'src/types'],
  ['utils', 'src/utils'],
  ['workers', 'src/workers'],
];

function removeIfBrokenLink(targetPath) {
  if (!existsSync(targetPath)) {
    return;
  }

  const stats = lstatSync(targetPath);
  if (!stats.isSymbolicLink()) {
    return;
  }

  const resolvedPath = path.resolve(path.dirname(targetPath), readlinkSync(targetPath));
  if (!existsSync(resolvedPath)) {
    rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureRootAppDir() {
  if (!existsSync(srcAppDir)) {
    return;
  }

  removeIfBrokenLink(rootAppDir);

  if (process.env.LOFIMART_MIRROR_ROOT_APP !== '1') {
    if (process.env.LOFIMART_CREATE_ROOT_APP_LINK !== '1') {
      return;
    }

    if (!existsSync(rootAppDir)) {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      symlinkSync(srcAppDir, rootAppDir, linkType);
      console.log('[ensure-root-app-dir] Linked app -> src/app for Next route type validation.');
    }

    return;
  }

  if (existsSync(rootAppDir)) {
    const stats = lstatSync(rootAppDir);
    if (stats.isSymbolicLink()) {
      rmSync(rootAppDir, { recursive: true, force: true });
    } else {
      rmSync(rootAppDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  mkdirSync(path.dirname(rootAppDir), { recursive: true });
  cpSync(srcAppDir, rootAppDir, { recursive: true, force: true });
  console.log('[ensure-root-app-dir] Mirrored app <- src/app because LOFIMART_MIRROR_ROOT_APP=1.');
}

function ensureCompatibilityLinks() {
  if (process.env.LOFIMART_CREATE_ROOT_COMPAT_LINKS !== '1') {
    return;
  }

  const linkType = process.platform === 'win32' ? 'junction' : 'dir';

  for (const [rootName, sourcePath] of compatibilityLinks) {
    const sourceDir = path.join(projectRoot, sourcePath);
    const targetDir = path.join(projectRoot, rootName);

    if (!existsSync(sourceDir) || existsSync(targetDir)) {
      continue;
    }

    symlinkSync(sourceDir, targetDir, linkType);
    console.log(`[ensure-root-app-dir] Linked ${rootName} -> ${sourcePath} for app-root compatibility.`);
  }
}

function ensureRootIndexCss() {
  if (process.env.LOFIMART_CREATE_ROOT_SHIMS !== '1') {
    return;
  }

  if (existsSync(rootIndexCssPath)) {
    return;
  }

  writeFileSync(rootIndexCssPath, "@import './src/index.css';\n", 'utf8');
  console.log('[ensure-root-app-dir] Added root index.css compatibility shim.');
}

function ensureRootTypesFile() {
  if (process.env.LOFIMART_CREATE_ROOT_SHIMS !== '1') {
    return;
  }

  if (existsSync(rootTypesPath)) {
    return;
  }

  writeFileSync(rootTypesPath, "export * from './src/types';\n", 'utf8');
  console.log('[ensure-root-app-dir] Added root types.ts compatibility shim.');
}

function ensureLibCompatibilityFiles() {
  if (process.env.LOFIMART_CREATE_ROOT_SHIMS !== '1') {
    return;
  }

  if (!existsSync(srcLibDir)) {
    return;
  }

  mkdirSync(rootLibDir, { recursive: true });

  for (const entry of readdirSync(srcLibDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }

    const targetPath = path.join(rootLibDir, entry.name);
    if (existsSync(targetPath)) {
      continue;
    }

    const moduleName = entry.name.replace(/\.ts$/, '');
    const needsDefaultExport = moduleName === 'api';
    const contents = needsDefaultExport
      ? `export * from '../src/lib/${moduleName}';\nexport { default } from '../src/lib/${moduleName}';\n`
      : `export * from '../src/lib/${moduleName}';\n`;
    writeFileSync(targetPath, contents, 'utf8');
    console.log(`[ensure-root-app-dir] Added lib/${entry.name} compatibility shim.`);
  }
}

ensureRootAppDir();
ensureCompatibilityLinks();
ensureRootIndexCss();
ensureRootTypesFile();
ensureLibCompatibilityFiles();
