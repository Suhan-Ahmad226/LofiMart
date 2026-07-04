import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, '.next');
const serverDir = path.join(nextDir, 'server');
const pagesDir = path.join(serverDir, 'pages');
const chunksDir = path.join(serverDir, 'chunks');
const rootPagesDir = path.join(projectRoot, 'pages');
const srcPagesDir = path.join(projectRoot, 'src', 'pages');
const requireFromProject = createRequire(import.meta.url);

function hasPagesRouter() {
  return existsSync(rootPagesDir) || existsSync(srcPagesDir);
}

function shouldHealNextCache() {
  if (hasPagesRouter()) {
    return false;
  }

  if (!existsSync(pagesDir) || !existsSync(chunksDir)) {
    return false;
  }

  const pageFiles = readdirSync(pagesDir).filter((file) => file.endsWith('.js'));

  for (const file of pageFiles) {
    const filePath = path.join(pagesDir, file);
    try {
      requireFromProject(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Cannot find module '\.\/\d+\.js'/.test(message)) {
        console.warn(
          `[next-heal-cache] Detected stale .next cache: ${path.relative(projectRoot, filePath)} failed to resolve a server chunk.`,
        );
        return true;
      }

      throw error;
    }
  }

  return false;
}

function main() {
  if (!existsSync(nextDir)) {
    return;
  }

  if (!shouldHealNextCache()) {
    return;
  }

  try {
    rmSync(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `if (Test-Path '${nextDir}') { Remove-Item -LiteralPath '${nextDir}' -Recurse -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: 'ignore' },
      );
    } else {
      throw error;
    }
  }
  console.log('[next-heal-cache] Removed stale .next cache. Re-run the Next command to rebuild clean artifacts.');
}

main();
