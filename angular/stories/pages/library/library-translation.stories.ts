import type { Meta, StoryObj } from '@storybook/angular';
import { translationScenarioOptions, translationStoryDecorators } from '../../fixtures/translation-story';
import type { TranslationStoryArgs } from '../../fixtures/translation-story';
import { UNANALYSED_NOVEL } from '../../fixtures/analysis';

const meta: Meta<TranslationStoryArgs> = {
  title: 'Pages/Library/Translation',
  parameters: { layout: 'fullscreen' },
  args: { route: '/library/n-jade-river', scenario: 'normal' },
  argTypes: { scenario: { control: 'select', options: translationScenarioOptions } },
  decorators: translationStoryDecorators,
  render: (args) => ({
    props: { ...args, route: args.scenario === 'notAnalysed' ? `/library/${UNANALYSED_NOVEL.id}` : args.route },
    template: '<ds-library-story-host [route]="route" [chapter]="1" />',
  }),
};

export default meta;
type Story = StoryObj<TranslationStoryArgs>;
export const Main: Story = {};
