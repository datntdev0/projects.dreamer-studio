import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@storage': fromRoot('electron/main/storage') },
  },
  test: {
    slowTestThreshold: 3000,
    environment: 'node',
    include: ['electron/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
    env: { DREAMER_TEST_LOG_DIR: fromRoot('.testing/logs') },
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.{ts,mjs}', 'shared/**/*.ts', 'scripts/**/*.mjs'],
      exclude: ['**/dist/**', '**/node_modules/**'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: '.testing/coverage/electron',
    },
  },
});
