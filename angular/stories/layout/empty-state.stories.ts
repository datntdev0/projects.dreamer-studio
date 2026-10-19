import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';

interface EmptyStateArgs {
  kind: 'empty' | 'loading' | 'error';
}

const meta: Meta<EmptyStateArgs> = {
  title: 'Layout/Empty state',
  parameters: { layout: 'fullscreen' },
  decorators: [moduleMetadata({ imports: [ButtonDirective, IconComponent, AreaStateComponent] })],
  args: { kind: 'empty' },
  render: (args) => ({
    props: args,
    template: `
      <div style="height: 100vh">
        <section class="ds-page">
          <div class="ds-page-toolbar">
            <h1>Projects</h1>
            <div class="ds-page-actions"><button dsBtn variant="primary" size="sm"><ds-icon name="plus" size="sm" />New project</button></div>
          </div>
          <div class="ds-page-body center">
            @switch (kind) {
              @case ('empty') {
                <ds-area-state kind="empty" icon="folder" heading="No projects yet" description="Create a project to start producing content.">
                  <button dsBtn variant="primary"><ds-icon name="plus" size="sm" />New project</button>
                </ds-area-state>
              }
              @case ('loading') {
                <ds-area-state kind="loading" heading="Loading projects..." />
              }
              @case ('error') {
                <ds-area-state kind="error" heading="Could not load projects" description="Check your connection and try again." details="Error: ECONNREFUSED 127.0.0.1:8000" detailsLabel="Details">
                  <button dsBtn><ds-icon name="retry" size="sm" />Retry</button>
                </ds-area-state>
              }
            }
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Empty: StoryObj<EmptyStateArgs> = {};

export const Loading: StoryObj<EmptyStateArgs> = { args: { kind: 'loading' } };

export const ErrorState: StoryObj<EmptyStateArgs> = { args: { kind: 'error' } };
