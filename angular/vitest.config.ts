import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text-summary', 'html'],
      reportsDirectory: '../.testing/coverage/angular',
    },
  },
});
