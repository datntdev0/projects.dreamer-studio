import type { Meta, StoryObj } from '@storybook/angular';
import {
  analysisScenarioOptions,
  analysisStoryDecorators,
  type AnalysisStoryArgs,
} from '../../fixtures/analysis-story';

const meta: Meta<AnalysisStoryArgs> = {
  title: 'Pages/Analysis/Omniscient',
  parameters: { layout: 'fullscreen' },
  args: { route: '/omniscient', scenario: 'normal' },
  argTypes: { scenario: { control: 'select', options: analysisScenarioOptions } },
  decorators: analysisStoryDecorators,
  render: (args) => ({ props: args, template: '<ds-shell-story-host [route]="route" />' }),
};

export default meta;
type Story = StoryObj<AnalysisStoryArgs>;
export const Main: Story = {};
