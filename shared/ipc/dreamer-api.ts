import { AppError } from '../errors/app-error';
import { AppInfo } from './app';
import { BackendStatus } from './backend';
import { DevCrashKind } from './dev';
import { Language } from '../i18n/translate';
import { LogEntry } from './log';
import { PipelineListQuery, PipelineLogChunk, PipelinePage } from '../models/pipeline';
import { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '../models/pipeline';
import { SettingsState } from '../models/settings';

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
  settings: {
    get(): Promise<SettingsState>;
  };
  pipeline: {
    types(): Promise<PipelineTypeInfo[]>;
    start(request: PipelineStartRequest): Promise<PipelineRun>;
    cancel(id: string): Promise<void>;
    list(query: PipelineListQuery): Promise<PipelinePage>;
    get(id: string): Promise<PipelineRun>;
    log(id: string): Promise<string[]>;
    delete(ids: string[]): Promise<string[]>;
    onUpdate(listener: (run: PipelineRun) => void): () => void;
    onDeleted(listener: (ids: string[]) => void): () => void;
    onLog(listener: (chunk: PipelineLogChunk) => void): () => void;
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
