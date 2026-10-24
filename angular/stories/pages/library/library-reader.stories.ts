import type { Meta } from '@storybook/angular';
import type { StoryObj } from '@storybook/angular';
import type { LibraryStoryArgs } from '../../fixtures/library-story';
import { libraryStoryDecorators } from '../../fixtures/library-story';

const meta: Meta<LibraryStoryArgs> = {
  title: 'Pages/Library/Reader',
  parameters: { layout: 'fullscreen' },
  args: {
    route: '/library/n-0006',
    scenario: 'filled',
    importState: 'paused',
    chapter: 12,
    missingChapter: null,
    tab: 'reading',
    searchQuery: '',
    searchState: 'idle',
    focusMode: false,
    editing: false,
    lock: false,
  },
  decorators: libraryStoryDecorators,
  render: (args) => ({
    props: args,
    template:
      '<ds-library-story-host [route]="route" [scenario]="scenario" [importState]="importState" [chapter]="chapter" [missingChapter]="missingChapter" [tab]="tab" [searchQuery]="searchQuery" [searchState]="searchState" [focusMode]="focusMode" [editing]="editing" [lock]="lock" />',
  }),
};

export default meta;

type Story = StoryObj<LibraryStoryArgs>;

export const Main: Story = {};

export const ChapterMissing: Story = { args: { missingChapter: 12 } };

export const FocusMode: Story = { args: { focusMode: true } };

export const NoChapters: Story = { args: { route: '/library/n-empty', chapter: null } };

export const Locked: Story = { args: { lock: true } };

export const NovelNotFound: Story = { args: { route: '/library/n-missing' } };

export const NovelLoadError: Story = { args: { route: '/library/n-broken' } };
