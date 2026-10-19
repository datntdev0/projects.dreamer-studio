import { Injectable } from '@angular/core';
import '@dreamer/shared/ipc/dreamer-api';
import type { BackendStatus } from '@dreamer/shared/ipc/backend';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { AppError } from '@dreamer/shared/errors/app-error';
import type { LogEntry } from '@dreamer/shared/ipc/log';
import type { Language } from '@dreamer/shared/i18n/translate';

@Injectable({ providedIn: 'root' })
export class DesktopApi {
  async info(): Promise<AppInfo | null> {
    return window.dreamer ? window.dreamer.app.info() : null;
  }

  async openLogs(): Promise<void> {
    if (window.dreamer) await window.dreamer.app.openLogs();
  }

  async openDataDir(): Promise<void> {
    if (window.dreamer) await window.dreamer.app.openDataDir();
  }

  onError(listener: (error: AppError) => void): () => void {
    return window.dreamer ? window.dreamer.app.onError(listener) : () => undefined;
  }

  onBackendStatus(listener: (status: BackendStatus) => void): () => void {
    return window.dreamer ? window.dreamer.backend.onStatus(listener) : () => undefined;
  }

  async backendStatus(): Promise<BackendStatus | null> {
    return window.dreamer ? window.dreamer.backend.status() : null;
  }

  setLanguage(language: Language): void {
    if (window.dreamer) window.dreamer.app.setLanguage(language);
  }

  writeLog(entry: LogEntry): void {
    if (window.dreamer) window.dreamer.log.write(entry);
  }
}
