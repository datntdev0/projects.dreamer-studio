import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendStatus } from '@dreamer/shared/ipc/backend';
import type { AppDataStatus } from '@dreamer/shared/models/app-data';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from '@core/desktop-api';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';
import { SettingsPage } from './settings.page';

const APP_DATA_DIR = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';
const APP_INFO: AppInfo = {
  version: '0.0.0',
  buildDate: '2026-10-20',
  author: 'datntdev',
  appDataDir: APP_DATA_DIR,
  settingsDir: APP_DATA_DIR,
  electron: '44.9.0',
  chrome: '150.0.7800.45',
  node: '24.11.0',
  os: 'Windows 10.0.19045 (x64)',
  schemaVersion: '0.0.0_1',
};
const APP_DATA_STATUS: AppDataStatus = {
  path: APP_DATA_DIR,
  freeBytes: 412 * 1024 ** 3,
  writable: true,
  schemaVersion: '0.0.0_1',
  checkedAt: '2026-10-20T10:42:00.000Z',
};

class SettingsStoreStub {
  readonly state = signal<SettingsState | null>({
    settings: defaultSettings(APP_DATA_DIR),
    defaultAppDataDir: APP_DATA_DIR,
    notice: 'none',
  });
  readonly settings = computed(() => this.state()?.settings ?? null);

  async update(patch: SettingsPatch): Promise<boolean> {
    const current: SettingsState | null = this.state();
    if (!current) return false;
    const settings: AppSettings = {
      ...current.settings,
      ...patch,
      pipelines: patch.pipelines ?? current.settings.pipelines,
    };
    this.state.set({ ...current, settings });
    return true;
  }

  async reset(): Promise<boolean> {
    return true;
  }
}

class PipelineStoreStub {
  readonly active = signal({ state: 'ready' as const, runs: [] });
}

function desktopApi(): Partial<DesktopApi> {
  const backend: BackendStatus = { state: 'running', address: '127.0.0.1:47123' };
  return {
    info: async () => APP_INFO,
    appDataStatus: async () => APP_DATA_STATUS,
    backendStatus: async () => backend,
    onBackendStatus: (listener) => {
      listener(backend);
      return () => undefined;
    },
    onAppDataChanged: () => () => undefined,
    onAppDataProgress: () => () => undefined,
    onSettingsChanged: () => () => undefined,
    openDataDir: async () => undefined,
    openLink: async () => undefined,
    pickAppDataFolder: async () => null,
    inspectAppData: async () => null,
    switchAppData: async () => null,
    runDiagnostics: async () => null,
    writeLog: () => undefined,
  };
}

describe('SettingsPage', () => {
  async function createPage(id: string, state?: SettingsState | null) {
    const params = new BehaviorSubject(convertToParamMap({ id }));
    const settings = new SettingsStoreStub();
    settings.state.set(state === undefined ? settings.state() : state);
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: DesktopApi, useValue: desktopApi() },
        { provide: SettingsStore, useValue: settings },
        { provide: PipelineStore, useValue: new PipelineStoreStub() },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the loading state until settings are available', async () => {
    const fixture = await createPage('general', null);

    expect(fixture.nativeElement.querySelector('[data-testid="settings-loading"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="settings-content"]')).toBeNull();
  });

  it('renders the production settings sections and reset notice', async () => {
    const state: SettingsState = {
      settings: defaultSettings(APP_DATA_DIR),
      defaultAppDataDir: APP_DATA_DIR,
      notice: 'invalidFields',
    };
    const fixture = await createPage('general', state);

    expect(fixture.nativeElement.querySelector('[data-testid="settings-reset-notice"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="settings-general"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="settings-pipeline"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="settings-storage"]')).not.toBeNull();
  });

  it('renders the production diagnostics pane for the diagnostics route', async () => {
    const fixture = await createPage('diagnostics');

    expect(fixture.nativeElement.querySelector('[data-testid="settings-diagnostics-pane"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="settings-general"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="about"]')).not.toBeNull();
  });

  it('treats the storage alias as General and dismisses the reset notice', async () => {
    const state: SettingsState = {
      settings: defaultSettings(APP_DATA_DIR),
      defaultAppDataDir: APP_DATA_DIR,
      notice: 'invalidFields',
    };
    const fixture = await createPage('storage', state);

    expect(fixture.nativeElement.querySelector('[data-testid="settings-general"]')).not.toBeNull();
    fixture.componentInstance['dismissNotice']();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="settings-reset-notice"]')).toBeNull();
  });
});
