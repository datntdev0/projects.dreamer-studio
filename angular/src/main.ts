import { ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppErrorHandler } from './core/error-handler';
import { provideIconSprite } from './core/icons/icon-sprite';
import { RootComponent } from './root.component';

bootstrapApplication(RootComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideIconSprite(),
  ],
}).catch((error: unknown) => console.error(error));
