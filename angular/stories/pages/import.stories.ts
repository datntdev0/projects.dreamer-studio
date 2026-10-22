import { provideRouter, withHashLocation } from '@angular/router';
import { ToastOutletComponent } from '@components/toast/toast-outlet.component';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ImportPage } from '../../src/features/library/import/import.page';
import { provideFakeLibraryApi, type LibrarySampleId } from '../fixtures/library-api';

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
  title: 'Pages/Import',
  parameters: { layout: 'fullscreen' },
  args: { sample: 'ok' },
  argTypes: { sample: { control: 'select', options: SAMPLE_OPTIONS } },
  decorators: [
    moduleMetadata({ imports: [ImportPage, ToastOutletComponent] }),
    (story, context) => {
      const result: ReturnType<typeof story> = story();
      return {
        ...result,
        applicationConfig: {
          providers: [
            ...(result.applicationConfig?.providers ?? []),
            provideRouter([], withHashLocation()),
            provideFakeLibraryApi(context.args.sample),
          ],
        },
      };
    },
  ],
  render: () => ({
    template: `
      <div class="ds-app-center" style="display: flex; width: 100vw; height: 100vh">
        <ds-import-page />
      </div>
      <ds-toast-outlet closeLabel="Close" />
    `,
  }),
};

export default meta;

type Story = StoryObj<ImportArgs>;

export const Main: Story = {};

export const MinimalMetadata: Story = { args: { sample: 'minimal' } };

export const NoChapters: Story = { args: { sample: 'noChapters' } };

export const Problems: Story = { args: { sample: 'problems' } };
