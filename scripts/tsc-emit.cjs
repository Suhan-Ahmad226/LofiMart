#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  // tsconfig.json already excludes src/tests, so no unsupported CLI
  // exclusion flag is needed here.
  execSync('npx tsc --noEmit --project tsconfig.json', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  console.log('TypeScript check passed');
} catch (error) {
  console.error('TypeScript check failed');
  process.exit(1);
}
