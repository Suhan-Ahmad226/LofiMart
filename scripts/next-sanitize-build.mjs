import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const appDir = path.join(projectRoot, 'src', 'app');
const nextDir = path.join(projectRoot, '.next');
const stalePaths = [
  path.join(nextDir, 'types'),
  path.join(nextDir, 'server', 'pages'),
  path.join(nextDir, 'static', 'chunks', 'pages'),
  path.join(nextDir, 'server', 'pages-manifest.json'),
  path.join(nextDir, 'server', 'pages-manifest.js'),
];

function main() {
  if (!existsSync(appDir)) {
    return;
  }

  const removedPaths = [];

  for (const stalePath of stalePaths) {
    if (!existsSync(stalePath)) {
      continue;
    }

    rmSync(stalePath, { recursive: true, force: true });
    removedPaths.push(path.relative(projectRoot, stalePath));
  }

  if (removedPaths.length > 0) {
    console.log(
      `[next-sanitize-build] Removed stale app-router-incompatible build artifacts: ${removedPaths.join(', ')}.`,
    );
  }
}

main();
