import type { Provider } from '@angular/core';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { DesktopApi } from '../../src/core/desktop-api';

export interface DesktopApiFixture {
  info?: AppInfo | 'error' | 'loading';
  backend?: BackendState;
  openDataDirFails?: boolean;
}

export const APP_INFO: AppInfo = { version: '0.0.0', appDataDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio' };

export function provideDesktopApi(fixture: DesktopApiFixture = {}): Provider {
  const info: AppInfo | 'error' | 'loading' = fixture.info ?? APP_INFO;
  const api: Partial<DesktopApi> = {
    info: (): Promise<AppInfo | null> => {
      if (info === 'loading') return new Promise<AppInfo | null>(() => undefined);
      if (info === 'error') return Promise.reject(new Error('app:info failed: IPC channel closed'));
      return Promise.resolve(info);
    },
    openLogs: (): Promise<void> => Promise.resolve(),
    openDataDir: (): Promise<void> =>
      fixture.openDataDirFails
        ? Promise.reject(new Error(`Cannot open folder ${APP_INFO.appDataDir}`))
        : Promise.resolve(),
    onError: (): (() => void) => () => undefined,
    onBackendStatus: (listener: (status: BackendStatus) => void): (() => void) => {
      listener({ state: fixture.backend ?? 'running' });
      return () => undefined;
    },
    backendStatus: (): Promise<BackendStatus | null> => Promise.resolve({ state: fixture.backend ?? 'running' }),
    setLanguage: (): void => undefined,
    writeLog: (): void => undefined,
  };
  return { provide: DesktopApi, useValue: api };
}
