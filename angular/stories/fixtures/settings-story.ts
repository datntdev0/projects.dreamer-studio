import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { Decorator } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { I18nService } from '@core/i18n/i18n.service';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '@core/slots';
import type { PipelineSlot } from '@core/slots';
import { ThemeService } from '@core/theme/theme.service';
import { ComingSoonPage } from '@shell/coming-soon/coming-soon.page';
import { MODULES } from '@shell/registry/modules';
import { ShellComponent } from '@shell/shell.component';
import { buildRoutes } from '@shell/shell.routes';
import { APP_INFO, provideDesktopApi } from './desktop-api';
import type { DiagnosticsScenario } from './desktop-api';

export interface SettingsScenario {
  loading: boolean;
  settingsReset: boolean;
  appDataDir: string;
  defaultAppDataDir: string;
  pipelinesActive: number;
  maxConcurrent: number;
  diagnostics: DiagnosticsScenario;
  devBuild: boolean;
}

export interface SettingsStoryArgs {
  route: string;
  scenario: SettingsScenario;
}

const DEFAULT_APP_DATA_DIR = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';

export const DEFAULT_SETTINGS_SCENARIO: SettingsScenario = {
  loading: false,
  settingsReset: false,
  appDataDir: DEFAULT_APP_DATA_DIR,
  defaultAppDataDir: DEFAULT_APP_DATA_DIR,
  pipelinesActive: 0,
  maxConcurrent: 1,
  diagnostics: 'issues',
  devBuild: false,
};

class SettingsStoryStore {
  readonly state;
  readonly settings: Signal<AppSettings | null>;

  constructor(
    private readonly scenario: SettingsScenario,
    private readonly i18n: I18nService,
    private readonly theme: ThemeService,
  ) {
    const initial: AppSettings = {
      ...defaultSettings(this.scenario.appDataDir),
      pipelines: { maxConcurrent: this.scenario.maxConcurrent },
    };
    this.state = signal<SettingsState | null>(
      this.scenario.loading
        ? null
        : {
            settings: initial,
            defaultAppDataDir: this.scenario.defaultAppDataDir,
            notice: this.scenario.settingsReset ? 'invalidFields' : 'none',
          },
    );
    this.settings = computed(() => this.state()?.settings ?? null);
    const settings: AppSettings | null = this.settings();
    if (settings) this.apply(settings);
  }

  async update(patch: SettingsPatch): Promise<boolean> {
    const current: SettingsState | null = this.state();
    if (!current) return false;
    const settings: AppSettings = {
      ...current.settings,
      ...patch,
      pipelines: patch.pipelines ?? current.settings.pipelines,
      llm: { ...current.settings.llm, ...patch.llm },
    };
    this.state.set({ ...current, settings });
    this.apply(settings);
    return true;
  }

  async reset(section: SettingsSection): Promise<boolean> {
    const current: SettingsState | null = this.state();
    if (!current) return false;
    const defaults: AppSettings = defaultSettings(this.scenario.defaultAppDataDir);
    const settings: AppSettings =
      section === 'general'
        ? { ...current.settings, language: defaults.language, theme: defaults.theme }
        : section === 'llm'
          ? { ...current.settings, llm: { ...current.settings.llm, features: {} } }
          : { ...current.settings, pipelines: defaults.pipelines };
    this.state.set({ ...current, settings });
    this.apply(settings);
    return true;
  }

  private apply(settings: AppSettings): void {
    this.i18n.setLanguage(settings.language);
    this.theme.setTheme(settings.theme);
  }
}

class PipelineStoryStore {
  readonly active: Signal<PipelineSlot>;

  constructor(count: number) {
    this.active = signal<PipelineSlot>({ state: 'ready', runs: activeRuns(count) });
  }
}

function activeRuns(count: number): PipelineRun[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    type: 'demo',
    status: 'running',
    cancelReason: null,
    progress: 50,
    stepIndex: 3,
    stepCount: 5,
    stepName: 'pipeline.step.3',
    errorCode: null,
    error: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    startedAt: '2026-10-20T00:01:00.000Z',
    finishedAt: null,
    label: null,
    novelId: null,
  }));
}

@Component({
  selector: 'ds-settings-story-host',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div>',
})
export class SettingsStoryHostComponent implements OnInit {
  readonly route = input<string>('/settings/general');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

export const settingsStoryDecorators: Decorator<SettingsStoryArgs>[] = [
  moduleMetadata({ imports: [SettingsStoryHostComponent] }),
  (story, context) => {
    const result = story();
    const scenario: SettingsScenario = context.args.scenario;
    const providers = [
      provideRouter(buildRoutes(MODULES, ComingSoonPage), withHashLocation()),
      provideDesktopApi({
        backend: 'running',
        diagnostics: scenario.diagnostics,
        info: {
          ...APP_INFO,
          appDataDir: scenario.appDataDir,
          buildDate: scenario.devBuild ? null : APP_INFO.buildDate,
        },
      }),
      {
        provide: SettingsStore,
        useFactory: () => new SettingsStoryStore(scenario, inject(I18nService), inject(ThemeService)),
      },
      { provide: PipelineStore, useFactory: () => new PipelineStoryStore(scenario.pipelinesActive) },
      { provide: ACTIVE_PIPELINES, useFactory: () => inject(PipelineStore).active },
      { provide: RECENT_PIPELINES, useFactory: () => inject(PipelineStore).active },
    ];
    return {
      ...result,
      applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
    };
  },
];
