import type { Meta, StoryObj } from '@storybook/angular';
import { provideFakeLibraryApi, type LibrarySampleId } from '../../fixtures/library-api';
import { shellStoryDecorators } from '../../fixtures/shell-story';

interface ImportArgs {
  sample: LibrarySampleId;
}

const SAMPLE_OPTIONS: LibrarySampleId[] = [
  'ok',
  'minimal',
  'noChapters',
  'notZip',
  'unsafePath',
  'unsupportedType',
  'tooLarge',
  'problems',
];

const meta: Meta<ImportArgs> = {
  title: 'Pages/Library/Import',
  parameters: { layout: 'fullscreen' },
  args: { sample: 'ok' },
  argTypes: { sample: { control: 'select', options: SAMPLE_OPTIONS } },
  decorators: shellStoryDecorators<ImportArgs>((args) => provideFakeLibraryApi(args.sample)),
  render: () => ({ template: '<ds-shell-story-host route="/library/import" />' }),
};

export default meta;

type Story = StoryObj<ImportArgs>;

export const Main: Story = {};

export const MinimalMetadata: Story = { args: { sample: 'minimal' } };

export const NoChapters: Story = { args: { sample: 'noChapters' } };

export const Problems: Story = { args: { sample: 'problems' } };
