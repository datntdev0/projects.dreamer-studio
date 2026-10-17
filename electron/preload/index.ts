import { contextBridge, ipcRenderer } from 'electron';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppChannel } from '@dreamer/shared/ipc/channels';
import { DreamerApi } from '@dreamer/shared/ipc/dreamer-api';

const api: DreamerApi = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(AppChannel.Info),
  },
};

contextBridge.exposeInMainWorld('dreamer', api);
