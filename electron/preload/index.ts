import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';
import { AppError } from '@dreamer/shared/errors/app-error';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { AppChannel, AppDataChannel, BackendChannel, DevChannel } from '@dreamer/shared/ipc/channels';
import {
  DiagnosticsChannel,
  LibraryChannel,
  LogChannel,
  PipelineChannel,
  SettingsChannel,
} from '@dreamer/shared/ipc/channels';
import { DevCrashKind } from '@dreamer/shared/ipc/dev';
import { DreamerApi } from '@dreamer/shared/ipc/dreamer-api';
import { IpcResult } from '@dreamer/shared/ipc/ipc-result';
import { LogEntry } from '@dreamer/shared/ipc/log';
import { AboutLink } from '@dreamer/shared/models/about';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { PipelineListQuery, PipelineLogChunk, PipelinePage } from '@dreamer/shared/models/pipeline';
import { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { DeleteNovelsResult } from '@dreamer/shared/models/novel';
import { LibraryChangedEvent, NovelDetail, NovelPatch, NovelSummary } from '@dreamer/shared/models/novel';
import { NovelImportRequest, PackageReadResult, PickedImage } from '@dreamer/shared/models/novel-package';
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
    openLink: (link: AboutLink): Promise<void> => call(AppChannel.OpenLink, link),
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
  appData: {
    pickFolder: (): Promise<string | null> => call(AppDataChannel.PickFolder),
    inspect: (path: string): Promise<AppDataCandidate> => call(AppDataChannel.Inspect, path),
    switch: (path: string): Promise<AppInfo> => call(AppDataChannel.Switch, path),
    status: (): Promise<AppDataStatus> => call(AppDataChannel.Status),
    onProgress: (listener: (step: AppDataStep) => void): (() => void) => subscribe(AppDataChannel.Progress, listener),
    onChanged: (listener: (info: AppInfo) => void): (() => void) => subscribe(AppDataChannel.Changed, listener),
  },
  diagnostics: {
    run: (): Promise<DiagnosticsRun> => call(DiagnosticsChannel.Run),
  },
  library: {
    pickPackage: (): Promise<string | null> => call(LibraryChannel.PickPackage),
    readPackage: (path: string): Promise<PackageReadResult> => call(LibraryChannel.ReadPackage, path),
    pickImage: (): Promise<PickedImage | null> => call(LibraryChannel.PickImage),
    import: (request: NovelImportRequest): Promise<PipelineRun> => call(LibraryChannel.Import, request),
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
    list: (): Promise<NovelSummary[]> => call(LibraryChannel.List),
    get: (id: string): Promise<NovelDetail> => call(LibraryChannel.Get, id),
    updateNovel: (id: string, patch: NovelPatch): Promise<NovelDetail> =>
      call(LibraryChannel.UpdateNovel, { id, patch }),
    deleteNovels: (ids: string[]): Promise<DeleteNovelsResult> => call(LibraryChannel.DeleteNovels, ids),
    openFolder: (id: string): Promise<void> => call(LibraryChannel.OpenFolder, id),
    onChanged: (listener: (event: LibraryChangedEvent) => void): (() => void) =>
      subscribe(LibraryChannel.Changed, listener),
  },
  dev: {
    crash: (kind: DevCrashKind): Promise<void> => call(DevChannel.Crash, kind),
  },
};

contextBridge.exposeInMainWorld('dreamer', api);
