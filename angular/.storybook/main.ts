import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  framework: '@storybook/angular',
  stories: ['../stories/**/*.stories.ts'],
  staticDirs: ['../public', { from: '../src/assets', to: '/' }],
  webpackFinal: async (webpackConfig) => {
    webpackConfig.performance = {
      ...webpackConfig.performance,
      maxAssetSize: 3 * 1024 * 1024,
      maxEntrypointSize: 4 * 1024 * 1024,
    };
    return webpackConfig;
  },
};

export default config;
