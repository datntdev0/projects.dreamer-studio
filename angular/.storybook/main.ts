import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  framework: '@storybook/angular',
  stories: ['../stories/**/*.stories.ts'],
  staticDirs: ['../public', { from: '../src/assets', to: '/' }],
};

export default config;
