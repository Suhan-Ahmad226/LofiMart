import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const importPattern =
  /((?:import|export)\s+(?:[^'"\n]+?\s+from\s+)?|import\s*\()\s*['"](\.\.?\/[^'"]+)['"](\)?;?)/g;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function needsExtension(specifier) {
  const ext = path.extname(specifier);
  return !ext;
}

async function fixFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  let changed = false;

  const updated = source.replace(importPattern, (match, prefix, specifier, suffix) => {
    if (!needsExtension(specifier)) {
      return match;
    }

    changed = true;
    return `${prefix}"${specifier}.js"${suffix}`;
  });

  if (changed) {
    await fs.writeFile(filePath, updated, 'utf8');
  }
}

async function main() {
  try {
    const files = await walk(distDir);
    await Promise.all(files.map(fixFile));
  } catch (error) {
    console.error('[fix-dist-imports] failed', error);
    process.exit(1);
  }
}

await main();
