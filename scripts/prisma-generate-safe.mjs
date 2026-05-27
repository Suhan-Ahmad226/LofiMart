import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const PRISMA_CLIENT_MARKERS = [
  path.join(process.cwd(), 'node_modules', '@prisma', 'client', 'index.js'),
  path.join(process.cwd(), 'node_modules', '.prisma', 'client', 'index.js'),
  path.join(process.cwd(), 'node_modules', '.prisma', 'client', 'client.js'),
];
const PRISMA_INPUTS = [
  path.join(process.cwd(), 'prisma', 'schema.prisma'),
  path.join(process.cwd(), 'prisma.config.ts'),
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPrismaGenerate() {
  return new Promise((resolve) => {
    let combinedOutput = '';
    const child = spawn('npx', ['prisma', 'generate'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      env: process.env,
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(text);
    });

    child.on('exit', (code) => resolve({ code: code ?? 1, output: combinedOutput }));
    child.on('error', () => resolve({ code: 1, output: combinedOutput }));
  });
}

function hasGeneratedPrismaClient() {
  return PRISMA_CLIENT_MARKERS.every((file) => existsSync(file));
}

function getLatestMtime(paths) {
  let latest = 0;
  for (const file of paths) {
    if (!existsSync(file)) {
      continue;
    }

    const mtime = statSync(file).mtimeMs;
    if (mtime > latest) {
      latest = mtime;
    }
  }
  return latest;
}

function shouldSkipGenerate() {
  if (!hasGeneratedPrismaClient()) {
    return false;
  }

  const latestInputMtime = getLatestMtime(PRISMA_INPUTS);
  const latestClientMtime = getLatestMtime(PRISMA_CLIENT_MARKERS);

  return latestInputMtime > 0 && latestClientMtime >= latestInputMtime;
}

function isWindowsFileLock(output) {
  return (
    process.platform === 'win32' &&
    output.includes('EPERM') &&
    output.includes('query_engine-windows.dll.node')
  );
}

async function main() {
  if (shouldSkipGenerate()) {
    console.log(
      '[prisma-generate-safe] Existing Prisma client is up to date with the current schema. Skipping generate.',
    );
    process.exit(0);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await runPrismaGenerate();
    if (result.code === 0) {
      process.exit(0);
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `[prisma-generate-safe] Prisma generate failed on attempt ${attempt}/${MAX_ATTEMPTS}. Retrying in ${RETRY_DELAY_MS}ms...`,
      );
      await delay(RETRY_DELAY_MS);
      continue;
    }

    if (isWindowsFileLock(result.output) && hasGeneratedPrismaClient()) {
      console.warn(
        '[prisma-generate-safe] Prisma generate is locked by another node process, but an existing Prisma client is already available.',
      );
      console.warn(
        '[prisma-generate-safe] Continuing with the existing generated client so local builds are not blocked by the Windows file lock.',
      );
      process.exit(0);
    }

    console.error('[prisma-generate-safe] Prisma generate failed after multiple attempts.');
    console.error(
      '[prisma-generate-safe] On Windows this usually means node is still holding the Prisma engine file lock.',
    );
    console.error(
      '[prisma-generate-safe] Close running dev/prod servers, or run: Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force',
    );
    process.exit(result.code);
  }
}

await main();
