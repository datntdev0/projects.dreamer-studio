import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { AppError } from '@dreamer/shared/errors/app-error';
import { Language } from '@dreamer/shared/i18n/translate';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { AppChannel, BackendChannel, DevChannel, LogChannel } from '@dreamer/shared/ipc/channels';
import { DevCrashKind } from '@dreamer/shared/ipc/dev';
import { DreamerApi } from '@dreamer/shared/ipc/dreamer-api';
import { LogEntry } from '@dreamer/shared/ipc/log';

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
  dev: {
    crash: (kind: DevCrashKind): Promise<void> => ipcRenderer.invoke(DevChannel.Crash, kind),
  },
};

contextBridge.exposeInMainWorld('dreamer', api);
