import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.{ts,mjs}', 'shared/**/*.ts', 'scripts/**/*.mjs'],
      exclude: ['**/dist/**', '**/node_modules/**'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage/electron',
    },
  },
});
