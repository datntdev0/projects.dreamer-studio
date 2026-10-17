import { Injectable } from '@angular/core';
import '@dreamer/shared/ipc/dreamer-api';
import type { BackendStatus } from '@dreamer/shared/ipc/backend';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { AppError } from '@dreamer/shared/errors/app-error';
import type { LogEntry } from '@dreamer/shared/ipc/log';

@Injectable({ providedIn: 'root' })
export class DesktopApi {
  async info(): Promise<AppInfo | null> {
    return window.dreamer ? window.dreamer.app.info() : null;
  }

  async openLogs(): Promise<void> {
    if (window.dreamer) await window.dreamer.app.openLogs();
  }

  onError(listener: (error: AppError) => void): () => void {
    return window.dreamer ? window.dreamer.app.onError(listener) : () => undefined;
  }

  onBackendStatus(listener: (status: BackendStatus) => void): () => void {
    return window.dreamer ? window.dreamer.backend.onStatus(listener) : () => undefined;
  }

  writeLog(entry: LogEntry): void {
    if (window.dreamer) window.dreamer.log.write(entry);
  }
}
