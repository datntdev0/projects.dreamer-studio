import type { Decorator, Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideIconSprite } from '../src/core/icons/icon-sprite';

const themeDecorator: Decorator = (story, context) => {
  document.documentElement.dataset['theme'] = context.globals['theme'];
  return story();
};

const preview: Preview = {
  decorators: [applicationConfig({ providers: [provideIconSprite()] }), themeDecorator],
  initialGlobals: { theme: 'light' },
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
