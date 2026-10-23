import type { NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import type { Provider } from '@angular/core';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import type { AppDataCandidate, AppDataStatus } from '@dreamer/shared/models/app-data';
import type { CheckResult, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from '../../src/core/desktop-api';

export interface DesktopApiFixture {
  info?: AppInfo | 'error' | 'loading';
  backend?: BackendState;
  openDataDirFails?: boolean;
  diagnostics?: DiagnosticsScenario;
}

export type DiagnosticsScenario = 'ok' | 'issues' | 'engineError';

const SCHEMA_VERSION = '0.0.0_1';
const BACKEND_ADDRESS = '127.0.0.1:47123';
const DIAGNOSTICS_RUN_MS = 900;
const GB = 1024 ** 3;

export const APP_INFO: AppInfo = {
  version: '0.0.0',
  buildDate: '2026-10-19',
  author: 'datntdev',
  appDataDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio',
  settingsDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio',
  electron: '44.9.0',
  chrome: '150.0.7800.45',
  node: '24.11.0',
  os: 'Windows 10.0.19045 (x64)',
  schemaVersion: SCHEMA_VERSION,
};

export function fakeBackendStatus(state: BackendState = 'running'): BackendStatus {
  return { state, address: state === 'running' ? BACKEND_ADDRESS : null };
}

export const APP_DATA_STATUS: AppDataStatus = {
  path: APP_INFO.appDataDir,
  freeBytes: 412 * 1024 ** 3,
  writable: true,
  schemaVersion: SCHEMA_VERSION,
  checkedAt: '2026-01-01T00:00:00.000Z',
};

function check(id: string, category: CheckResult['category'], status: CheckResult['status'], params = {}): CheckResult {
  const prefix = `diagnostics.check.${id}`;
  return {
    id,
    category,
    status,
    nameKey: `${prefix}.name`,
    messageKey: `${prefix}.${status}`,
    fixKey: status === 'ok' ? null : `${prefix}.fix`,
    params,
    durationMs: 12,
  };
}

export function fakeDiagnosticsRun(scenario: DiagnosticsScenario = 'issues'): DiagnosticsRun {
  const issues = scenario === 'issues';
  return {
    ranAt: new Date().toISOString(),
    results: [
      check('storage.appData', 'storage', 'ok', { path: APP_INFO.appDataDir }),
      check('storage.settingsDir', 'storage', 'ok', { path: APP_INFO.appDataDir }),
      check('storage.diskSpace', 'storage', issues ? 'warning' : 'ok', {
        drive: 'C:',
        free: issues ? 0.8 * GB : 214 * GB,
      }),
      check('database.integrity', 'database', 'ok'),
      check('backend.reachable', 'backend', issues ? 'error' : 'ok'),
      check('settings.file', 'settings', 'ok'),
    ],
  };
}

function fakeRunDiagnostics(scenario: DiagnosticsScenario): Promise<DiagnosticsRun | null> {
  return new Promise<DiagnosticsRun | null>((resolve, reject) =>
    setTimeout(() => {
      if (scenario === 'engineError') reject(new Error('diagnostics:run failed: APP_DATA_SWITCHING'));
      else resolve(fakeDiagnosticsRun(scenario));
    }, DIAGNOSTICS_RUN_MS),
  );
}

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
    openLink: (): Promise<void> => Promise.resolve(),
    onError: (): (() => void) => () => undefined,
    onBackendStatus: (listener: (status: BackendStatus) => void): (() => void) => {
      listener(fakeBackendStatus(fixture.backend));
      return () => undefined;
    },
    backendStatus: (): Promise<BackendStatus | null> => Promise.resolve(fakeBackendStatus(fixture.backend)),
    writeLog: (): void => undefined,
    pickAppDataFolder: (): Promise<string | null> => Promise.resolve(null),
    inspectAppData: (): Promise<AppDataCandidate | null> => Promise.resolve(null),
    switchAppData: (): Promise<AppInfo | null> => Promise.resolve(null),
    appDataStatus: (): Promise<AppDataStatus | null> => Promise.resolve(APP_DATA_STATUS),
    onAppDataProgress: (): (() => void) => () => undefined,
    onAppDataChanged: (): (() => void) => () => undefined,
    runDiagnostics: (): Promise<DiagnosticsRun | null> => fakeRunDiagnostics(fixture.diagnostics ?? 'issues'),
    listNovels: (): Promise<NovelSummary[]> => Promise.resolve([]),
    getNovel: (): Promise<NovelDetail | null> => Promise.resolve(null),
    openNovelFolder: (): Promise<void> => Promise.resolve(),
    onLibraryChanged: (): (() => void) => () => undefined,
    ...fakeSettingsApi(),
  };
  return { provide: DesktopApi, useValue: api };
}
