import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'coverage',
      '**/.angular',
      'backend',
      '_docs',
      '.claude',
      'worktree',
      '.playwright-cli',
    ],
  },
  {
    files: ['**/*.{ts,mts,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['electron/**', 'scripts/**', 'shared/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['electron/**'],
    ignores: ['electron/main/storage/**', 'electron/main/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['node:sqlite', 'sqlite'].map((name) => ({
            name,
            message: 'Use a repository from electron/main/storage/repositories; only storage/ may use node:sqlite.',
          })),
          patterns: [
            {
              regex: '(^|/)storage/database(\\.ts)?$',
              message: 'Only electron/main/storage and the composition root (index.ts) may import the Database.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['angular/**'],
    languageOptions: { globals: globals.browser },
  },
);
