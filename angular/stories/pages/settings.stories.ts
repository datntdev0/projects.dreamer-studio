import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { I18nService } from '../../src/core/i18n/i18n.service';
import { PipelineStore } from '../../src/core/stores/pipeline-store';
import { SettingsStore } from '../../src/core/stores/settings-store';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../src/core/slots';
import type { PipelineSlot } from '../../src/core/slots';
import { ThemeService } from '../../src/core/theme/theme.service';
import { ComingSoonPage } from '../../src/shell/coming-soon/coming-soon.page';
import { MODULES } from '../../src/shell/registry/modules';
import { ShellComponent } from '../../src/shell/shell.component';
import { buildRoutes } from '../../src/shell/shell.routes';
import { APP_INFO, provideDesktopApi } from '../fixtures/desktop-api';
import type { DiagnosticsScenario } from '../fixtures/desktop-api';

interface SettingsScenario {
  loading: boolean;
  settingsReset: boolean;
  appDataDir: string;
  defaultAppDataDir: string;
  pipelinesActive: number;
  maxConcurrent: number;
  diagnostics: DiagnosticsScenario;
  devBuild: boolean;
}

interface SettingsArgs {
  route: string;
  scenario: SettingsScenario;
}

const DEFAULT_APP_DATA_DIR = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';

const DEFAULT_SCENARIO: SettingsScenario = {
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
  }));
}

@Component({
  selector: 'ds-settings-story-host',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div>',
})
class SettingsStoryHostComponent implements OnInit {
  readonly route = input<string>('/settings/general');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

const meta: Meta<SettingsArgs> = {
  title: 'Pages/Settings',
  parameters: { layout: 'fullscreen' },
  args: { route: '/settings/general', scenario: DEFAULT_SCENARIO },
  decorators: [
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
  ],
  render: (args) => ({
    props: args,
    template: '<ds-settings-story-host [route]="route" />',
  }),
};

export default meta;

type Story = StoryObj<SettingsArgs>;

export const Main: Story = {};

export const Loading: Story = {
  args: { scenario: { ...DEFAULT_SCENARIO, loading: true } },
};

export const SettingsReset: Story = {
  args: { scenario: { ...DEFAULT_SCENARIO, settingsReset: true } },
};

export const PipelinesActive: Story = {
  args: { scenario: { ...DEFAULT_SCENARIO, pipelinesActive: 2, maxConcurrent: 3 } },
};

export const AllChecksOk: Story = {
  args: { route: '/settings/diagnostics', scenario: { ...DEFAULT_SCENARIO, diagnostics: 'ok' } },
};

export const ChecksEngineError: Story = {
  args: { route: '/settings/diagnostics', scenario: { ...DEFAULT_SCENARIO, diagnostics: 'engineError' } },
};

export const DevBuild: Story = {
  args: { route: '/settings/diagnostics', scenario: { ...DEFAULT_SCENARIO, devBuild: true } },
};
