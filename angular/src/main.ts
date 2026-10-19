import { ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppErrorHandler } from './core/error-handler';
import { provideIconSprite } from './core/icons/icon-sprite';
import { RootComponent } from './root.component';
import { ComingSoonPage } from './shell/coming-soon/coming-soon.page';
import { MODULES } from './shell/registry/modules';
import { buildRoutes } from './shell/shell.routes';

bootstrapApplication(RootComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideIconSprite(),
    provideRouter(buildRoutes(MODULES, ComingSoonPage)),
  ],
}).catch((error: unknown) => console.error(error));
