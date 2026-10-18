import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const appDataPathMessage = 'Resolve app data paths with resolveAppPaths in storage/paths.ts.';

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
    files: ['electron/**'],
    ignores: ['electron/main/storage/paths.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='app'][callee.property.name='getPath']",
          message: appDataPathMessage,
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='LOCALAPPDATA']",
          message: appDataPathMessage,
        },
      ],
    },
  },
  {
    files: ['angular/**'],
    languageOptions: { globals: globals.browser },
  },
);
