import type { NovelSummary } from '@dreamer/shared/models/novel';
import type { Meta, StoryObj } from '@storybook/angular';
import { FIXTURE_SUMMARIES, provideFakeLibraryListApi } from '../../fixtures/library-list-api';
import type { FakeLibraryListOptions } from '../../fixtures/library-list-api';
import { IMPORT_QUEUED_RUN, IMPORT_RUNNING_RUN } from '../../fixtures/pipelines';
import { shellStoryDecorators } from '../../fixtures/shell-story';

interface LibraryListArgs {
  api: FakeLibraryListOptions;
}

const meta: Meta<LibraryListArgs> = {
  title: 'Pages/Library/List',
  parameters: { layout: 'fullscreen' },
  args: { api: { novels: FIXTURE_SUMMARIES, runs: [] } },
  decorators: shellStoryDecorators<LibraryListArgs>((args) => provideFakeLibraryListApi(args.api)),
  render: () => ({ template: '<ds-shell-story-host />' }),
};

export default meta;

type Story = StoryObj<LibraryListArgs>;

export const Main: Story = {};

export const Importing: Story = {
  args: { api: { novels: FIXTURE_SUMMARIES, runs: [IMPORT_RUNNING_RUN, IMPORT_QUEUED_RUN] } },
};

const LOCKED_NOVELS: NovelSummary[] = FIXTURE_SUMMARIES.map((novel: NovelSummary, index: number): NovelSummary =>
  index === 0
    ? { ...novel, lock: { runId: 'run-locked', type: 'novel-import', label: 'Export test', status: 'running' } }
    : novel,
);

export const LockedNovel: Story = { args: { api: { novels: LOCKED_NOVELS, runs: [] } } };

export const EmptyLibrary: Story = { args: { api: { novels: [], runs: [] } } };

export const LibraryLoadError: Story = { args: { api: { novels: [], runs: [], list: 'error' } } };
