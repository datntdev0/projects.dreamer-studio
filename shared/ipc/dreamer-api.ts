import { AppError } from '../errors/app-error';
import { AppInfo } from './app';
import { BackendStatus } from './backend';
import { DevCrashKind } from './dev';
import { Language } from '../i18n/translate';
import { LogEntry } from './log';

export interface DreamerApi {
  app: {
    info(): Promise<AppInfo>;
    openLogs(): Promise<void>;
    openDataDir(): Promise<void>;
    setLanguage(language: Language): void;
    onError(listener: (error: AppError) => void): () => void;
  };
  log: {
    write(entry: LogEntry): void;
  };
  backend: {
    status(): Promise<BackendStatus>;
    onStatus(listener: (status: BackendStatus) => void): () => void;
  };
  dev: {
    crash(kind: DevCrashKind): Promise<void>;
  };
}

declare global {
  interface Window {
    dreamer: DreamerApi;
  }
}
