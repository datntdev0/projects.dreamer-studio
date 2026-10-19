import type { Decorator, Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { inject, provideAppInitializer } from '@angular/core';
import { provideIconSprite } from '../src/core/icons/icon-sprite';
import { ThemeService, type Theme } from '../src/core/theme/theme.service';

const themeDecorator: Decorator = (story, context) => {
  const theme: Theme = context.globals['theme'];
  document.documentElement.dataset['theme'] = theme;
  const result = story();
  const providers = [provideAppInitializer(() => inject(ThemeService).setTheme(theme))];
  return {
    ...result,
    applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
  };
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
