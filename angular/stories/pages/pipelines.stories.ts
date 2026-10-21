import { Component, inject, input, OnInit, provideAppInitializer } from '@angular/core';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { PipelineStore } from '../../src/core/stores/pipeline-store';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../src/core/slots';
import { ComingSoonPage } from '../../src/shell/coming-soon/coming-soon.page';
import { MODULES } from '../../src/shell/registry/modules';
import { ShellComponent } from '../../src/shell/shell.component';
import { buildRoutes } from '../../src/shell/shell.routes';
import { ALL_RUNS, RUNNING_RUN } from '../fixtures/pipelines';
import { provideFakePipelinesApi, type FakePipelinesOptions } from '../fixtures/pipelines-api';

interface PipelinesArgs {
  route: string;
  api: FakePipelinesOptions;
}

const UNKNOWN_RUN_ID = '00000000-0000-4000-8000-000000000000';

@Component({
  selector: 'ds-pipelines-story-host',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div>',
})
class PipelinesStoryHostComponent implements OnInit {
  readonly route = input<string>('/pipelines');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

const meta: Meta<PipelinesArgs> = {
  title: 'Pages/Pipelines',
  parameters: { layout: 'fullscreen' },
  args: { route: `/pipelines/${RUNNING_RUN.id}`, api: { runs: ALL_RUNS } },
  decorators: [
    moduleMetadata({ imports: [PipelinesStoryHostComponent] }),
    (story, context) => {
      const result = story();
      const providers = [
        provideRouter(buildRoutes(MODULES, ComingSoonPage), withHashLocation()),
        provideFakePipelinesApi(context.args.api),
        provideAppInitializer(() => inject(PipelineStore).init()),
        { provide: ACTIVE_PIPELINES, useFactory: () => inject(PipelineStore).active },
        { provide: RECENT_PIPELINES, useFactory: () => inject(PipelineStore).recent },
      ];
      return {
        ...result,
        applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
      };
    },
  ],
  render: (args) => ({
    props: args,
    template: '<ds-pipelines-story-host [route]="route" />',
  }),
};

export default meta;

type Story = StoryObj<PipelinesArgs>;

export const Main: Story = {};

export const Empty: Story = {
  args: { route: '/pipelines', api: { runs: [], packaged: true } },
};

export const Loading: Story = {
  args: { route: '/pipelines', api: { runs: [], list: 'loading' } },
};

export const ErrorState: Story = {
  name: 'Error',
  args: { route: '/pipelines', api: { runs: [], list: 'error' } },
};

export const RunNotFound: Story = {
  args: { route: `/pipelines/${UNKNOWN_RUN_ID}` },
};
