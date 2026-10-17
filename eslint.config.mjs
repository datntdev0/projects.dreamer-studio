import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
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
    files: ['angular/**'],
    languageOptions: { globals: globals.browser },
  },
);
