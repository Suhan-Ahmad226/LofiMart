#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  execSync('npx tsc --noEmit --project tsconfig.json --excludeFiles "src/tests/**/*.ts"', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('TypeScript check passed');
} catch (error) {
  console.error('TypeScript check failed');
  process.exit(1);
}
