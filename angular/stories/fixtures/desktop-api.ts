import type { Provider } from '@angular/core';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from '../../src/core/desktop-api';

export interface DesktopApiFixture {
  info?: AppInfo | 'error' | 'loading';
  backend?: BackendState;
  openDataDirFails?: boolean;
}

export const APP_INFO: AppInfo = { version: '0.0.0', appDataDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio' };

export type FakeSettingsApi = Pick<DesktopApi, 'settings' | 'updateSettings' | 'resetSettings' | 'onSettingsChanged'>;

export function fakeSettingsApi(): FakeSettingsApi {
  let current: AppSettings = defaultSettings(APP_INFO.appDataDir);
  return {
    settings: (): Promise<SettingsState | null> =>
      Promise.resolve({ settings: current, defaultAppDataDir: APP_INFO.appDataDir, notice: 'none' }),
    updateSettings: (patch: SettingsPatch): Promise<AppSettings | null> => {
      current = { ...current, ...patch };
      return Promise.resolve(current);
    },
    resetSettings: (): Promise<AppSettings | null> => {
      current = defaultSettings(APP_INFO.appDataDir);
      return Promise.resolve(current);
    },
    onSettingsChanged: (): (() => void) => () => undefined,
  };
}

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
    writeLog: (): void => undefined,
    ...fakeSettingsApi(),
  };
  return { provide: DesktopApi, useValue: api };
}
