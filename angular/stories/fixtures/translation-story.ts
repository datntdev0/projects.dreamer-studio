import { provideRouter, withHashLocation } from '@angular/router';
import type { Decorator } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { LibraryStoryHostComponent, libraryStoryRoutes } from './library-story';
import { provideFakeTranslationApi } from './translation-api';
import type { TranslationScenario } from './translation-api';

export interface TranslationStoryArgs {
  route: string;
  scenario: TranslationScenario;
}

export const translationScenarioOptions: TranslationScenario[] = [
  'normal',
  'none',
  'running',
  'notAnalysed',
  'noLlm',
  'locked',
];

export const translationStoryDecorators: Decorator<TranslationStoryArgs>[] = [
  moduleMetadata<TranslationStoryArgs>({ imports: [LibraryStoryHostComponent] }),
  (story, context) => {
    const result = story();
    return {
      ...result,
      applicationConfig: {
        providers: [
          ...(result.applicationConfig?.providers ?? []),
          provideRouter(libraryStoryRoutes, withHashLocation()),
          ...provideFakeTranslationApi(context.args.scenario),
        ],
      },
    };
  },
];
