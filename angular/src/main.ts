import { ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppErrorHandler } from '@core/error-handler';
import { provideIconSprite } from '@core/icons/icon-sprite';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '@core/slots';
import { RootComponent } from './root.component';
import { ComingSoonPage } from '@shell/coming-soon/coming-soon.page';
import { MODULES } from '@shell/registry/modules';
import { buildRoutes } from '@shell/shell.routes';

bootstrapApplication(RootComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideIconSprite(),
    provideAppInitializer(() => inject(SettingsStore).load()),
    provideAppInitializer(() => inject(PipelineStore).init()),
    { provide: ACTIVE_PIPELINES, useFactory: () => inject(PipelineStore).active },
    { provide: RECENT_PIPELINES, useFactory: () => inject(PipelineStore).recent },
    provideRouter(buildRoutes(MODULES, ComingSoonPage)),
  ],
}).catch((error: unknown) => console.error(error));
