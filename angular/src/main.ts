import { ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppErrorHandler } from './core/error-handler';
import { RootComponent } from './root.component';

bootstrapApplication(RootComponent, {
  providers: [provideBrowserGlobalErrorListeners(), { provide: ErrorHandler, useClass: AppErrorHandler }],
}).catch((error: unknown) => console.error(error));
