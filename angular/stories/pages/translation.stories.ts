import type { Decorator, Meta, StoryObj } from '@storybook/angular';
import { shellStoryDecorators } from '../fixtures/shell-story';
import { provideFakeTranslationApi } from '../fixtures/translation-api';
import type { TranslationScenario } from '../fixtures/translation-api';
import { translationScenarioOptions } from '../fixtures/translation-story';

interface TranslationPageStoryArgs {
  route: '/translation';
  scenario: TranslationScenario;
}

const decorators: Decorator<TranslationPageStoryArgs>[] = shellStoryDecorators<TranslationPageStoryArgs>((args) =>
  provideFakeTranslationApi(args.scenario),
);

const meta: Meta<TranslationPageStoryArgs> = {
  title: 'Pages/Context/Translation',
  parameters: { layout: 'fullscreen' },
  args: { route: '/translation', scenario: 'normal' },
  argTypes: { scenario: { control: 'select', options: translationScenarioOptions } },
  decorators,
  render: (args) => ({ props: args, template: '<ds-shell-story-host [route]="route" />' }),
};

export default meta;
type Story = StoryObj<TranslationPageStoryArgs>;
export const Main: Story = {};

export const Empty: Story = { args: { scenario: 'notAnalysed' } };
