import { Component, inject, input, OnInit } from '@angular/core';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { ToastOptions, ToastService } from '@components/toast/toast.service';
import en from '@dreamer/shared/i18n/en.json';
import vi from '@dreamer/shared/i18n/vi.json';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { I18N_DICTIONARIES } from '../../src/core/i18n/i18n.service';
import type { PipelineRunView } from '../../src/core/slots';
import { ComingSoonPage } from '../../src/shell/coming-soon/coming-soon.page';
import { MODULES } from '../../src/shell/registry/modules';
import { ShellComponent } from '../../src/shell/shell.component';
import { buildRoutes } from '../../src/shell/shell.routes';
import { provideDesktopApi } from '../fixtures/desktop-api';
import { providePipelines, QUEUED_RUN, RUNNING_RUN } from '../fixtures/pipelines';

interface ShellArgs {
  backend: BackendState;
  activeRuns: PipelineRunView[];
  initialRoute: string;
  toasts: ToastOptions[];
}

@Component({
  selector: 'ds-shell-demo',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div>',
})
class ShellDemoComponent implements OnInit {
  readonly initialRoute = input<string>('/');
  readonly toasts = input<ToastOptions[]>([]);

  private readonly router: Router = inject(Router);
  private readonly toastService: ToastService = inject(ToastService);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.initialRoute());
    this.toastService.clear();
    this.toasts().forEach((toast) => this.toastService.show(toast));
  }
}

const meta: Meta<ShellArgs> = {
  title: 'Shell/App shell',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    initialRoute: {
      control: 'select',
      options: MODULES.map((module) => (module.id === 'home' ? '/' : `/${module.id}`)),
    },
  },
  args: { backend: 'running', activeRuns: [], initialRoute: '/', toasts: [] },
  decorators: [
    moduleMetadata({ imports: [ShellDemoComponent] }),
    (story, context) => {
      const result = story();
      const { backend, activeRuns } = context.args;
      const providers = [
        provideRouter(buildRoutes(MODULES, ComingSoonPage), withHashLocation()),
        provideDesktopApi({ backend }),
        providePipelines({ state: 'ready', runs: activeRuns }),
      ];
      return {
        ...result,
        applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
      };
    },
  ],
  render: (args) => ({
    props: args,
    template: '<ds-shell-demo [initialRoute]="initialRoute" [toasts]="toasts" />',
  }),
};

export default meta;

type Story = StoryObj<ShellArgs>;

export const Default: Story = {};

export const RailCollapsed: Story = {
  play: ({ canvasElement }): void => {
    canvasElement.querySelector<HTMLElement>('[data-testid="topbar-brand"]')?.click();
  },
};

export const ActiveEntry: Story = { args: { initialRoute: '/analysis' } };

export const BackendStarting: Story = { args: { backend: 'starting' } };

export const BackendFailed: Story = { args: { backend: 'unavailable' } };

export const PipelineRunning: Story = { args: { activeRuns: [RUNNING_RUN] } };

export const PipelineRunningAndQueued: Story = { args: { activeRuns: [RUNNING_RUN, QUEUED_RUN] } };

export const ToastStack: Story = {
  args: {
    toasts: [
      { kind: 'success', title: 'Pipeline succeeded', message: 'Demo pipeline #5 finished in 01:12.', autoHide: false },
      { kind: 'danger', title: 'Pipeline failed', message: 'Demo pipeline #7 failed at step 3.' },
      { kind: 'info', title: 'Settings file was reset', message: 'settings.json was invalid; defaults are in use.' },
    ],
  },
};

const viWithoutLibrary: Record<string, string> = { ...vi };
delete viWithoutLibrary['nav.library'];

export const VietnameseWithMissingKey: Story = {
  name: 'Vietnamese with a missing key',
  globals: { locale: 'vi' },
  decorators: [
    applicationConfig({ providers: [{ provide: I18N_DICTIONARIES, useValue: { en, vi: viWithoutLibrary } }] }),
  ],
};
