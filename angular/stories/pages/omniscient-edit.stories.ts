import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { EDIT_SCENARIOS, WorldEditStoryHostComponent, type EditScenario } from '../fixtures/world-edit';

interface EditStoryArgs {
  scenario: EditScenario;
}

const meta: Meta<EditStoryArgs> = {
  title: 'Pages/Omniscient/World edit dialog',
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'fixTypeNotAllowed' },
  argTypes: { scenario: { control: 'select', options: EDIT_SCENARIOS } },
  decorators: [moduleMetadata({ imports: [WorldEditStoryHostComponent] })],
  render: (args) => ({ props: args, template: '<ds-world-edit-story-host [scenario]="scenario" />' }),
};

export default meta;
type Story = StoryObj<EditStoryArgs>;
export const FixTypeNotAllowed: Story = {};
export const FixEntityNotFound: Story = { args: { scenario: 'fixEntityNotFound' } };
export const EditEntity: Story = { args: { scenario: 'editEntity' } };
export const MergeEntities: Story = { args: { scenario: 'mergeEntities' } };
export const SplitEntity: Story = { args: { scenario: 'splitEntity' } };
