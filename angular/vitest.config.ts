import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    slowTestThreshold: 3000,
    coverage: {
      reporter: ['text-summary', 'html'],
      reportsDirectory: '../.testing/coverage/angular',
    },
  },
});
