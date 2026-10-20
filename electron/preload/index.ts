import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { AppError } from '@dreamer/shared/errors/app-error';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { AppChannel, BackendChannel, DevChannel, LogChannel, PipelineChannel } from '@dreamer/shared/ipc/channels';
import { SettingsChannel } from '@dreamer/shared/ipc/channels';
import { DevCrashKind } from '@dreamer/shared/ipc/dev';
import { DreamerApi } from '@dreamer/shared/ipc/dreamer-api';
import { IpcResult } from '@dreamer/shared/ipc/ipc-result';
import { LogEntry } from '@dreamer/shared/ipc/log';
import { PipelineListQuery, PipelineLogChunk, PipelinePage } from '@dreamer/shared/models/pipeline';
import { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return (): void => {
    ipcRenderer.removeListener(channel, handler);
  };
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result: IpcResult<T> = await ipcRenderer.invoke(channel, ...args);
  if ('error' in result) {
    throw result.error;
  }
  return result.value;
}

const api: DreamerApi = {
  app: {
    info: (): Promise<AppInfo> => call(AppChannel.Info),
    openLogs: (): Promise<void> => call(AppChannel.OpenLogs),
    openDataDir: (): Promise<void> => call(AppChannel.OpenDataDir),
    onError: (listener: (error: AppError) => void): (() => void) => subscribe(AppChannel.Error, listener),
  },
  log: {
    write: (entry: LogEntry): void => ipcRenderer.send(LogChannel.Write, entry),
  },
  backend: {
    status: (): Promise<BackendStatus> => call(BackendChannel.GetStatus),
    onStatus: (listener: (status: BackendStatus) => void): (() => void) => subscribe(BackendChannel.Status, listener),
  },
  pipeline: {
    types: (): Promise<PipelineTypeInfo[]> => call(PipelineChannel.Types),
    start: (request: PipelineStartRequest): Promise<PipelineRun> => call(PipelineChannel.Start, request),
    cancel: (id: string): Promise<void> => call(PipelineChannel.Cancel, id),
    list: (query: PipelineListQuery): Promise<PipelinePage> => call(PipelineChannel.List, query),
    get: (id: string): Promise<PipelineRun> => call(PipelineChannel.Get, id),
    log: (id: string): Promise<string[]> => call(PipelineChannel.GetLog, id),
    delete: (ids: string[]): Promise<string[]> => call(PipelineChannel.Delete, ids),
    onUpdate: (listener: (run: PipelineRun) => void): (() => void) => subscribe(PipelineChannel.Update, listener),
    onDeleted: (listener: (ids: string[]) => void): (() => void) => subscribe(PipelineChannel.Deleted, listener),
    onLog: (listener: (chunk: PipelineLogChunk) => void): (() => void) => subscribe(PipelineChannel.Log, listener),
  },
  settings: {
    get: (): Promise<SettingsState> => call(SettingsChannel.Get),
    update: (patch: SettingsPatch): Promise<AppSettings> => call(SettingsChannel.Update, patch),
    reset: (section: SettingsSection): Promise<AppSettings> => call(SettingsChannel.Reset, section),
    onChanged: (listener: (settings: AppSettings) => void): (() => void) =>
      subscribe(SettingsChannel.Changed, listener),
  },
  dev: {
    crash: (kind: DevCrashKind): Promise<void> => call(DevChannel.Crash, kind),
  },
};

contextBridge.exposeInMainWorld('dreamer', api);
