import type { Meta, StoryObj } from '@storybook/angular';
import { analysisScenarioOptions, analysisStoryDecorators, type AnalysisStoryArgs } from '../fixtures/analysis-story';

const meta: Meta<AnalysisStoryArgs> = {
  title: 'Pages/Omniscient',
  parameters: { layout: 'fullscreen' },
  args: { route: '/omniscient', scenario: 'normal' },
  argTypes: { scenario: { control: 'select', options: analysisScenarioOptions } },
  decorators: analysisStoryDecorators,
  render: (args) => ({ props: args, template: '<ds-shell-story-host [route]="route" />' }),
};

export default meta;
type Story = StoryObj<AnalysisStoryArgs>;
export const Main: Story = {};
export const NoLlm: Story = { args: { scenario: 'noLlm' } };
export const EmptyLibrary: Story = { args: { scenario: 'emptyLibrary' } };

async function openReview(canvasElement: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const button = canvasElement.querySelector<HTMLButtonElement>('[data-testid="world-view-review"]');
    if (button) {
      button.click();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export const Review: Story = { play: ({ canvasElement }) => openReview(canvasElement) };
export const ReviewReadyToMerge: Story = {
  args: { scenario: 'readyToMerge' },
  play: ({ canvasElement }) => openReview(canvasElement),
};
