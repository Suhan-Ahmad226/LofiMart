#!/usr/bin/env node

const { rmSync } = require('node:fs');

for (const path of ['.next', '.next-prod', 'dist']) {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove ' + path + ':', error instanceof Error ? error.message : error);
  }
}
