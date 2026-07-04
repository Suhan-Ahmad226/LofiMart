import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: false,
  plugins: [
    {
      name: 'in-process-typescript-transform',
      enforce: 'pre',
      transform(code, id) {
        if (!/\.[cm]?tsx?$/.test(id)) {
          return null;
        }

        const result = ts.transpileModule(code, {
          fileName: id,
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
            sourceMap: true,
          },
        });

        return {
          code: result.outputText,
          map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
        };
      },
    },
  ],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    coverage: {
      enabled: false,
    },
  },
});
