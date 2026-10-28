import type { Meta } from '@storybook/angular';
import type { StoryObj } from '@storybook/angular';
import type { LibraryStoryArgs } from '../../fixtures/library-story';
import { libraryStoryDecorators } from '../../fixtures/library-story';
import { SAMPLE_PARAGRAPHS } from '../../fixtures/library';
import { translationScenarioOptions, translationStoryDecorators } from '../../fixtures/translation-story';
import type { TranslationStoryArgs } from '../../fixtures/translation-story';
import { UNANALYSED_NOVEL } from '../../fixtures/analysis';

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

export const Searching: Story = {
  args: { tab: 'search', searchQuery: SAMPLE_PARAGRAPHS[0].slice(0, 1), searchState: 'running' },
};

export const SearchResults: Story = {
  args: { tab: 'search', searchQuery: SAMPLE_PARAGRAPHS[0].slice(0, 1), searchState: 'results' },
};

export const SearchNoResults: Story = {
  args: { tab: 'search', searchQuery: 'unfindable-story-query', searchState: 'none' },
};

export const FocusMode: Story = { args: { focusMode: true } };

export const Editing: Story = { args: { editing: true } };

export const NoChapters: Story = { args: { route: '/library/n-empty', chapter: null } };

export const Locked: Story = { args: { lock: true } };

export const NovelNotFound: Story = { args: { route: '/library/n-missing' } };

export const NovelLoadError: Story = { args: { route: '/library/n-broken' } };

export const Translated: StoryObj<TranslationStoryArgs> = {
  args: { route: '/library/n-jade-river', scenario: 'normal' },
  argTypes: { scenario: { control: 'select', options: translationScenarioOptions } },
  decorators: translationStoryDecorators,
  render: (args) => ({
    props: { ...args, route: args.scenario === 'notAnalysed' ? `/library/${UNANALYSED_NOVEL.id}` : args.route },
    template: '<ds-library-story-host [route]="route" [chapter]="1" />',
  }),
};
