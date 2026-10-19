import { ErrorHandler, Injectable, inject } from '@angular/core';
import { AppError, ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { DesktopApi } from './desktop-api';
import { ErrorStore } from './error-store';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly errorStore: ErrorStore = inject(ErrorStore);

  handleError(error: unknown): void {
    console.error(error);
    const cause: unknown = (error as { rejection?: unknown } | null)?.rejection ?? error;
    const appError: AppError | undefined = isAppError(cause) ? cause : undefined;
    const message: string = error instanceof Error ? error.message : String(error);
    this.desktopApi.writeLog({
      level: 'error',
      module: 'angular',
      message: appError ? `${appError.code}: ${appError.message}` : message,
      stack: error instanceof Error ? errorStack(error) : undefined,
    });
    this.errorStore.add(appError?.code ?? ErrorCode.UiUnexpected);
  }
}
