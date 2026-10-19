import type { Decorator, Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { inject, provideAppInitializer } from '@angular/core';
import { provideIconSprite } from '../src/core/icons/icon-sprite';
import { I18nService, type Language } from '../src/core/i18n/i18n.service';
import { ThemeService, type Theme } from '../src/core/theme/theme.service';

const globalsDecorator: Decorator = (story, context) => {
  const theme: Theme = context.globals['theme'];
  const locale: Language = context.globals['locale'];
  document.documentElement.dataset['theme'] = theme;
  const result = story();
  const providers = [
    provideAppInitializer(() => inject(ThemeService).setTheme(theme)),
    provideAppInitializer(() => inject(I18nService).setLanguage(locale)),
  ];
  return {
    ...result,
    applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
  };
};

const preview: Preview = {
  decorators: [applicationConfig({ providers: [provideIconSprite()] }), globalsDecorator],
  initialGlobals: { theme: 'light', locale: 'en' },
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
    locale: {
      description: 'Language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'vi', title: 'Tiếng Việt' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
