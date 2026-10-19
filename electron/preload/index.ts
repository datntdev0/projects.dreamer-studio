import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { AppError } from '@dreamer/shared/errors/app-error';
import { Language } from '@dreamer/shared/i18n/translate';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { AppChannel, BackendChannel, DevChannel, LogChannel, PipelineChannel } from '@dreamer/shared/ipc/channels';
import { DevCrashKind } from '@dreamer/shared/ipc/dev';
import { DreamerApi } from '@dreamer/shared/ipc/dreamer-api';
import { LogEntry } from '@dreamer/shared/ipc/log';
import { PipelineListQuery, PipelineLogChunk, PipelinePage } from '@dreamer/shared/models/pipeline';
import { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return (): void => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: DreamerApi = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(AppChannel.Info),
    openLogs: (): Promise<void> => ipcRenderer.invoke(AppChannel.OpenLogs),
    openDataDir: (): Promise<void> => ipcRenderer.invoke(AppChannel.OpenDataDir),
    setLanguage: (language: Language): void => ipcRenderer.send(AppChannel.SetLanguage, language),
    onError: (listener: (error: AppError) => void): (() => void) => subscribe(AppChannel.Error, listener),
  },
  log: {
    write: (entry: LogEntry): void => ipcRenderer.send(LogChannel.Write, entry),
  },
  backend: {
    status: (): Promise<BackendStatus> => ipcRenderer.invoke(BackendChannel.GetStatus),
    onStatus: (listener: (status: BackendStatus) => void): (() => void) => subscribe(BackendChannel.Status, listener),
  },
  pipeline: {
    types: (): Promise<PipelineTypeInfo[]> => ipcRenderer.invoke(PipelineChannel.Types),
    start: (request: PipelineStartRequest): Promise<PipelineRun> => ipcRenderer.invoke(PipelineChannel.Start, request),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(PipelineChannel.Cancel, id),
    list: (query: PipelineListQuery): Promise<PipelinePage> => ipcRenderer.invoke(PipelineChannel.List, query),
    get: (id: string): Promise<PipelineRun> => ipcRenderer.invoke(PipelineChannel.Get, id),
    log: (id: string): Promise<string[]> => ipcRenderer.invoke(PipelineChannel.GetLog, id),
    delete: (ids: string[]): Promise<string[]> => ipcRenderer.invoke(PipelineChannel.Delete, ids),
    onUpdate: (listener: (run: PipelineRun) => void): (() => void) => subscribe(PipelineChannel.Update, listener),
    onDeleted: (listener: (ids: string[]) => void): (() => void) => subscribe(PipelineChannel.Deleted, listener),
    onLog: (listener: (chunk: PipelineLogChunk) => void): (() => void) => subscribe(PipelineChannel.Log, listener),
  },
  dev: {
    crash: (kind: DevCrashKind): Promise<void> => ipcRenderer.invoke(DevChannel.Crash, kind),
  },
};

contextBridge.exposeInMainWorld('dreamer', api);
