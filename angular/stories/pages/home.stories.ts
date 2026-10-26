import { signal } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { ToastOutletComponent } from '@components/toast/toast-outlet.component';
import { HomePage } from '../../src/features/home/home.page';
import { LibraryStore } from '../../src/core/stores/library-store';
import { RecentNovelStore } from '../../src/core/stores/recent-novel-store';
import { provideDesktopApi } from '../fixtures/desktop-api';
import { NOVELS, toNovelSummary } from '../fixtures/library';
import {
  ERROR,
  LOADING,
  providePipelines,
  QUEUED_RUN,
  READY_EMPTY,
  RECENT_RUNS,
  RUNNING_RUN,
} from '../fixtures/pipelines';

const meta: Meta = {
  title: 'Pages/Home',
  parameters: { layout: 'fullscreen' },
  decorators: [moduleMetadata({ imports: [HomePage, ToastOutletComponent] })],
  render: () => ({
    template: `
      <div class="ds-app-center" style="display: flex; width: 100vw; height: 100vh">
        <ds-home-page />
      </div>
      <ds-toast-outlet closeLabel="Close" />
    `,
  }),
};

export default meta;

type Story = StoryObj;

export const Data: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withHashLocation()),
        provideDesktopApi({ backend: 'running' }),
        {
          provide: LibraryStore,
          useValue: {
            novels: signal([toNovelSummary(NOVELS[0])]),
            state: signal('ready'),
            error: signal(null),
            load: async () => undefined,
          },
        },
        {
          provide: RecentNovelStore,
          useValue: { entries: signal([{ id: NOVELS[0].id, openedAt: new Date().toISOString() }]) },
        },
        ...providePipelines({ state: 'ready', runs: [RUNNING_RUN, QUEUED_RUN] }, { state: 'ready', runs: RECENT_RUNS }),
      ],
    }),
  ],
};

export const Empty: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withHashLocation()),
        provideDesktopApi({ backend: 'running' }),
        ...providePipelines(READY_EMPTY, READY_EMPTY),
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withHashLocation()),
        provideDesktopApi({ info: 'loading', backend: 'starting' }),
        ...providePipelines(LOADING, LOADING),
      ],
    }),
  ],
};

export const ErrorState: Story = {
  name: 'Error',
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withHashLocation()),
        provideDesktopApi({ info: 'error', backend: 'unavailable' }),
        ...providePipelines(READY_EMPTY, ERROR),
      ],
    }),
  ],
};

export const OpenFolderFails: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withHashLocation()),
        provideDesktopApi({ backend: 'running', openDataDirFails: true }),
        ...providePipelines({ state: 'ready', runs: [RUNNING_RUN] }, { state: 'ready', runs: RECENT_RUNS }),
      ],
    }),
  ],
};
