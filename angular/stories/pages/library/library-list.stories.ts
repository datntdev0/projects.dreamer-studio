import { Component, inject, input, OnInit, provideAppInitializer } from '@angular/core';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { NovelSummary } from '@dreamer/shared/models/novel';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../../src/core/slots';
import { PipelineStore } from '../../../src/core/stores/pipeline-store';
import { ComingSoonPage } from '../../../src/shell/coming-soon/coming-soon.page';
import { MODULES } from '../../../src/shell/registry/modules';
import { ShellComponent } from '../../../src/shell/shell.component';
import { buildRoutes } from '../../../src/shell/shell.routes';
import { FIXTURE_SUMMARIES, provideFakeLibraryListApi } from '../../fixtures/library-list-api';
import type { FakeLibraryListOptions } from '../../fixtures/library-list-api';
import { IMPORT_QUEUED_RUN, IMPORT_RUNNING_RUN } from '../../fixtures/pipelines';

interface LibraryListArgs {
  api: FakeLibraryListOptions;
}

@Component({
  selector: 'ds-library-list-story-host',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell [initialRailExpanded]="false" /></div>',
})
class LibraryListStoryHostComponent implements OnInit {
  readonly route = input<string>('/library');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

const meta: Meta<LibraryListArgs> = {
  title: 'Pages/Library/List',
  parameters: { layout: 'fullscreen' },
  args: { api: { novels: FIXTURE_SUMMARIES, runs: [] } },
  decorators: [
    moduleMetadata({ imports: [LibraryListStoryHostComponent] }),
    (story, context) => {
      const result = story();
      const providers = [
        provideRouter(buildRoutes(MODULES, ComingSoonPage), withHashLocation()),
        provideFakeLibraryListApi(context.args.api),
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
  render: () => ({ template: '<ds-library-list-story-host />' }),
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
