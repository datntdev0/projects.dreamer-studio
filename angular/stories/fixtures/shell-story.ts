import { Component, inject, input, OnInit, provideAppInitializer } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { Decorator } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '@core/slots';
import { PipelineStore } from '@core/stores/pipeline-store';
import { ComingSoonPage } from '@shell/coming-soon/coming-soon.page';
import { MODULES } from '@shell/registry/modules';
import { ShellComponent } from '@shell/shell.component';
import { buildRoutes } from '@shell/shell.routes';

@Component({
  selector: 'ds-shell-story-host',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell [initialRailExpanded]="false" /></div>',
})
export class ShellStoryHostComponent implements OnInit {
  readonly route = input<string>('/library');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

type StoryProviders = Provider | EnvironmentProviders | (Provider | EnvironmentProviders)[];

export function shellStoryDecorators<TArgs>(desktopApi: (args: TArgs) => StoryProviders): Decorator<TArgs>[] {
  return [
    moduleMetadata({ imports: [ShellStoryHostComponent] }),
    (story, context) => {
      const result = story();
      const providers = [
        provideRouter(buildRoutes(MODULES, ComingSoonPage), withHashLocation()),
        ...[desktopApi(context.args)].flat(),
        provideAppInitializer(() => inject(PipelineStore).init()),
        { provide: ACTIVE_PIPELINES, useFactory: () => inject(PipelineStore).active },
        { provide: RECENT_PIPELINES, useFactory: () => inject(PipelineStore).recent },
      ];
      return {
        ...result,
        applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
      };
    },
  ];
}
