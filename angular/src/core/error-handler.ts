import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { DesktopApi } from './desktop-api';
import { ErrorStore } from './error-store';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly errorStore: ErrorStore = inject(ErrorStore);

  handleError(error: unknown): void {
    console.error(error);
    this.desktopApi.writeLog({
      level: 'error',
      module: 'angular',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? errorStack(error) : undefined,
    });
    this.errorStore.add(ErrorCode.UiUnexpected);
  }
}
