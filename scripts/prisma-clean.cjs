#!/usr/bin/env node

const { readdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const clientDir = join(process.cwd(), 'node_modules', '.prisma', 'client');
try {
  for (const name of readdirSync(clientDir)) {
    if (/\.tmp\d*$/.test(name)) rmSync(join(clientDir, name), { force: true });
  }
} catch (error) {
  if (error && error.code !== 'ENOENT') throw error;
}
