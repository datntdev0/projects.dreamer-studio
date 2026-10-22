import type { Meta } from '@storybook/angular';
import type { StoryObj } from '@storybook/angular';
import type { LibraryStoryArgs } from '../../fixtures/library-story';
import { libraryStoryDecorators } from '../../fixtures/library-story';

const meta: Meta<LibraryStoryArgs> = {
  title: 'Pages/Library/List',
  parameters: { layout: 'fullscreen' },
  args: { route: '/library', scenario: 'filled', importState: 'paused' },
  decorators: libraryStoryDecorators,
  render: (args) => ({
    props: args,
    template: '<ds-library-story-host [route]="route" [scenario]="scenario" [importState]="importState" />',
  }),
};

export default meta;

type Story = StoryObj<LibraryStoryArgs>;

export const Main: Story = {};

export const Importing: Story = { args: { importState: 'importing' } };
export const ImportQueued: Story = { args: { importState: 'queued' } };
export const ImportingMore: Story = { args: { importState: 'more' } };
export const ImportIncomplete: Story = { args: { importState: 'incomplete' } };
export const Imported: Story = { args: { importState: 'done' } };

export const EmptyLibrary: Story = { args: { scenario: 'empty' } };

export const LibraryLoadError: Story = { args: { scenario: 'error' } };
