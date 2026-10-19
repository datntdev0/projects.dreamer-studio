import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import type { Signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { SegmentedComponent } from '@components/form/segmented.component';
import type { SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { I18nService } from '../../src/core/i18n/i18n.service';
import type { Language } from '../../src/core/i18n/i18n.service';
import { TranslatePipe } from '../../src/core/i18n/translate.pipe';
import { ThemeService } from '../../src/core/theme/theme.service';
import type { Theme } from '../../src/core/theme/theme.service';
import { BannerComponent } from '@components/banner/banner.component';
import { DialogComponent } from '@components/dialog/dialog.component';
import { DotComponent } from '@components/status/dot.component';
import { PillComponent } from '@components/status/pill.component';
import type { PillKind } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { DesktopApi } from '../../src/core/desktop-api';
import { AreaStateComponent } from '@components/state/area-state.component';
import type { DotKind } from '@components/status/dot.component';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { AppInfoStore } from '../../src/core/app-info';
import { BackendStatus } from '../../src/core/backend-status';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, provideRouter, withHashLocation } from '@angular/router';
import { filter, map } from 'rxjs';
import { PageTitleDirective } from '../../src/shell/page-title.directive';
import type { Routes } from '@angular/router';
import { ComingSoonPage } from '../../src/shell/coming-soon/coming-soon.page';
import { MODULES } from '../../src/shell/registry/modules';
import { ShellComponent } from '../../src/shell/shell.component';
import { buildRoutes } from '../../src/shell/shell.routes';
import { provideDesktopApi } from '../fixtures/desktop-api';

type SettingsSection = 'general' | 'diagnostics';

const SETTINGS_SECTIONS: SettingsSection[] = ['general', 'diagnostics'];

interface UpcomingSettingsSection {
  id: string;
  release: string;
}

const UPCOMING_SETTINGS_SECTIONS: UpcomingSettingsSection[] = [{ id: 'llm', release: '0.2.0' }];

type DiagnosticsScenario = 'ok' | 'issues' | 'engineError';

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

const DEFAULT_APP_DATA_DIR: string = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';

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

const SETTINGS_SCENARIO = new InjectionToken<SettingsScenario>('SETTINGS_SCENARIO');

const DEFAULT_LANGUAGE: Language = 'en';
const DEFAULT_THEME: Theme = 'light';

@Component({
  selector: 'ds-settings-general-preview',
  imports: [ButtonDirective, SegmentedComponent, IconComponent, TranslatePipe],
  template: `
    <section class="settings-section" aria-labelledby="settings-general-title" data-testid="settings-general">
      <header class="settings-section-head">
        <h3 id="settings-general-title">{{ 'settings.general.title' | t }}</h3>
        <div class="settings-section-actions">
          <button dsBtn variant="ghost" size="sm" type="button" data-testid="settings-general-reset" (click)="reset()">
            <ds-icon name="undo" size="sm" />{{ 'settings.page.reset' | t }}
          </button>
        </div>
      </header>
      <div class="settings-group">
        <div class="settings-row" data-testid="settings-general-language-row">
          <div class="settings-row-text">
            <span class="settings-row-label">{{ 'settings.general.language' | t }}</span>
            <span class="settings-row-hint">{{ 'settings.general.languageHint' | t }}</span>
          </div>
          <div class="settings-row-control">
            <ds-segmented
              [options]="languageOptions()"
              [value]="i18n.language()"
              [label]="'settings.general.language' | t"
              data-testid="settings-general-language"
              (valueChange)="setLanguage($event)"
            />
          </div>
        </div>
        <div class="settings-row" data-testid="settings-general-theme-row">
          <div class="settings-row-text">
            <span class="settings-row-label">{{ 'settings.general.theme' | t }}</span>
            <span class="settings-row-hint">{{ 'settings.general.themeHint' | t }}</span>
          </div>
          <div class="settings-row-control">
            <ds-segmented
              [options]="themeOptions()"
              [value]="theme.theme()"
              [label]="'settings.general.theme' | t"
              data-testid="settings-general-theme"
              (valueChange)="setTheme($event)"
            />
          </div>
        </div>
      </div>
    </section>
  `,
})
class SettingsGeneralPreview {
  protected readonly i18n: I18nService = inject(I18nService);
  protected readonly theme: ThemeService = inject(ThemeService);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly toast: ToastService = inject(ToastService);

  protected readonly languageOptions = computed<SegmentedOption[]>(() => [
    { value: 'en', label: this.i18n.t('settings.general.languageEn') },
    { value: 'vi', label: this.i18n.t('settings.general.languageVi') },
  ]);
  protected readonly themeOptions = computed<SegmentedOption[]>(() => [
    { value: 'light', label: this.i18n.t('settings.general.themeLight'), icon: 'sun' },
    { value: 'dark', label: this.i18n.t('settings.general.themeDark'), icon: 'moon' },
  ]);

  protected setLanguage(language: string): void {
    this.i18n.setLanguage(language as Language);
  }

  protected setTheme(theme: string): void {
    this.theme.setTheme(theme as Theme);
  }

  protected async reset(): Promise<void> {
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('settings.general.resetTitle'),
      message: this.i18n.t('settings.general.resetMessage'),
      confirmLabel: this.i18n.t('settings.page.resetConfirm'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (!confirmed) {
      return;
    }
    this.i18n.setLanguage(DEFAULT_LANGUAGE);
    this.theme.setTheme(DEFAULT_THEME);
    this.toast.show({ kind: 'success', title: this.i18n.t('settings.general.resetDone') });
  }
}

const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 5;
const DEFAULT_CONCURRENT = 1;

@Component({
  selector: 'ds-settings-pipeline-preview',
  imports: [ButtonDirective, IconComponent, TranslatePipe],
  template: `
    <section class="settings-section" aria-labelledby="settings-pipeline-title" data-testid="settings-pipeline">
      <header class="settings-section-head">
        <h3 id="settings-pipeline-title">{{ 'settings.pipeline.title' | t }}</h3>
        <div class="settings-section-actions">
          <button dsBtn variant="ghost" size="sm" type="button" data-testid="settings-pipeline-reset" (click)="reset()">
            <ds-icon name="undo" size="sm" />{{ 'settings.page.reset' | t }}
          </button>
        </div>
      </header>
      <div class="settings-group">
        <div class="settings-row" data-testid="settings-pipeline-max-row">
          <div class="settings-row-text">
            <label class="settings-row-label" for="settings-pipeline-max">{{ 'settings.pipeline.max' | t }}</label>
            <span class="settings-row-hint" id="settings-pipeline-max-hint" data-testid="settings-pipeline-max-hint">
              {{ 'settings.pipeline.maxHint' | t }}
            </span>
            @if (scenario.pipelinesActive > 0) {
              <span class="settings-row-hint num" data-testid="settings-pipeline-active">
                {{ 'settings.pipeline.activeNow' | t: { count: scenario.pipelinesActive } }}
              </span>
            }
          </div>
          <div class="settings-row-control settings-range">
            <input
              id="settings-pipeline-max"
              type="range"
              [min]="min"
              [max]="max"
              step="1"
              [value]="value()"
              aria-describedby="settings-pipeline-max-hint"
              data-testid="settings-pipeline-max"
              (input)="onInput($event)"
            />
            <output class="num" for="settings-pipeline-max" data-testid="settings-pipeline-max-value">{{
              value()
            }}</output>
          </div>
        </div>
      </div>
    </section>
  `,
})
class SettingsPipelinePreview {
  protected readonly scenario: SettingsScenario = inject(SETTINGS_SCENARIO);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly toast: ToastService = inject(ToastService);

  protected readonly min: number = MIN_CONCURRENT;
  protected readonly max: number = MAX_CONCURRENT;
  protected readonly value = signal<number>(this.scenario.maxConcurrent);

  protected onInput(event: Event): void {
    this.value.set(Number((event.target as HTMLInputElement).value));
  }

  protected async reset(): Promise<void> {
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('settings.pipeline.resetTitle'),
      message: this.i18n.t('settings.pipeline.resetMessage'),
      confirmLabel: this.i18n.t('settings.page.resetConfirm'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (!confirmed) {
      return;
    }
    this.value.set(DEFAULT_CONCURRENT);
    this.toast.show({ kind: 'success', title: this.i18n.t('settings.pipeline.resetDone') });
  }
}

type FolderKind = 'existing' | 'older' | 'empty' | 'notWritable' | 'newer' | 'upgradeFails';
type StepState = 'done' | 'running' | 'pending' | 'failed';

interface SampleFolder {
  path: string;
  kind: FolderKind;
  note: string;
  freeGb: number;
}

interface FolderStatus {
  freeGb: number;
  schema: string;
  checkedAt: string;
}

interface FolderView {
  pill: string;
  pillKind: PillKind;
  message: string;
  dbStep: string | null;
  failsAtDb: boolean;
}

interface SwitchStep {
  id: string;
  label: string;
  state: StepState;
}

const CHECK_MS = 600;
const STEP_MS = 700;
const NEWER_DB_VERSION = 7;
const SUPPORTED_DB_VERSION = 4;
const STEP_PREFIX = 'settings.storage.switch.step.';
const SETTINGS_DIR = '%LOCALAPPDATA%\\DreamerStudio';
const CURRENT_SCHEMA = '0.0.0_1';
const DEFAULT_FREE_GB = 412;
const FIRST_CHECK_AT = '10:42';

const SAMPLE_FOLDERS: SampleFolder[] = [
  { path: 'D:\\DreamerData', kind: 'existing', note: 'settings.storage.sim.existing', freeGb: 812 },
  { path: 'E:\\Backup\\DreamerStudio-2025', kind: 'older', note: 'settings.storage.sim.older', freeGb: 1350 },
  { path: 'D:\\Projects\\NewLibrary', kind: 'empty', note: 'settings.storage.sim.empty', freeGb: 812 },
  {
    path: 'C:\\Program Files\\DreamerData',
    kind: 'notWritable',
    note: 'settings.storage.sim.notWritable',
    freeGb: 412,
  },
  { path: '\\\\nas\\shared\\DreamerStudio', kind: 'newer', note: 'settings.storage.sim.newer', freeGb: 2048 },
  {
    path: 'E:\\Old\\DreamerStudio-broken',
    kind: 'upgradeFails',
    note: 'settings.storage.sim.upgradeFails',
    freeGb: 1350,
  },
];

const EXISTING_VIEW: FolderView = {
  pill: 'settings.storage.review.existing',
  pillKind: 'success',
  message: 'settings.storage.review.existingMsg',
  dbStep: 'dbOpen',
  failsAtDb: false,
};

const OLDER_VIEW: FolderView = {
  pill: 'settings.storage.review.older',
  pillKind: 'warning',
  message: 'settings.storage.review.olderMsg',
  dbStep: 'dbUpgrade',
  failsAtDb: false,
};

const FOLDER_VIEWS: Record<FolderKind, FolderView> = {
  existing: EXISTING_VIEW,
  older: OLDER_VIEW,
  upgradeFails: { ...OLDER_VIEW, failsAtDb: true },
  empty: {
    pill: 'settings.storage.review.empty',
    pillKind: 'info',
    message: 'settings.storage.review.emptyMsg',
    dbStep: 'dbCreate',
    failsAtDb: false,
  },
  notWritable: {
    pill: 'settings.storage.sim.notWritable',
    pillKind: 'danger',
    message: 'settings.storage.error.notWritable',
    dbStep: null,
    failsAtDb: false,
  },
  newer: {
    pill: 'settings.storage.sim.newer',
    pillKind: 'danger',
    message: 'settings.storage.error.newer',
    dbStep: null,
    failsAtDb: false,
  },
};

const STEP_ICONS: Record<StepState, string> = {
  done: 'check',
  running: '',
  pending: 'minus',
  failed: 'alert-circle',
};

function currentTime(): string {
  const now: Date = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

@Component({
  selector: 'ds-settings-storage-preview',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonDirective,
    DialogComponent,
    DotComponent,
    IconComponent,
    PillComponent,
    ProgressComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  template: `
    <section class="settings-section settings-storage" data-testid="settings-storage">
      <header class="settings-section-head">
        <h3>{{ 'settings.storage.title' | t }}</h3>
        <div class="settings-section-actions">
          <span [dsTooltip]="resetTooltip()">
            <button
              dsBtn
              variant="ghost"
              size="sm"
              type="button"
              data-testid="settings-storage-reset"
              [disabled]="isDefault() || blocked()"
              (click)="reset()"
            >
              <ds-icon name="undo" size="sm" />{{ 'settings.storage.reset' | t }}
            </button>
          </span>
        </div>
      </header>

      <div class="settings-group">
        <div class="settings-row settings-storage-current">
          <div class="settings-row-text">
            <span class="settings-row-label settings-storage-path-line">
              <code class="settings-storage-path" data-testid="settings-storage-path">{{ appDataDir() }}</code>
              <button
                dsBtn
                variant="ghost"
                size="sm"
                [iconOnly]="true"
                type="button"
                data-testid="settings-storage-copy"
                [attr.aria-label]="'settings.storage.copy' | t"
                [dsTooltip]="'settings.storage.copy' | t"
                (click)="copy()"
              >
                <ds-icon name="copy" size="sm" />
              </button>
            </span>
            <span class="settings-row-hint settings-status-line" data-testid="settings-storage-status">
              <span>{{ 'settings.storage.status.free' | t: { size: status().freeGb } }}</span>
              <span>{{ 'settings.storage.status.readWrite' | t }}</span>
              <span>{{ 'settings.storage.status.database' | t: { version: status().schema } }}</span>
              <span>{{ 'settings.storage.status.checked' | t: { time: status().checkedAt } }}</span>
            </span>
            @if (blocked()) {
              <span id="settings-storage-blocked" class="settings-row-hint" data-testid="settings-storage-blocked">
                {{ 'settings.storage.blocked.message' | t: { count: scenario.pipelinesActive } }}
                <a routerLink="/pipelines" data-testid="settings-storage-blocked-link">{{
                  'settings.storage.blocked.link' | t
                }}</a>
              </span>
            }
          </div>
          <div class="settings-row-control">
            <button
              dsBtn
              size="sm"
              type="button"
              data-testid="settings-storage-change"
              [disabled]="blocked()"
              [loading]="checking()"
              [attr.aria-describedby]="blocked() ? 'settings-storage-blocked' : null"
              (click)="pickerOpen.set(true)"
            >
              {{ (checking() ? 'settings.storage.checking' : 'settings.storage.change') | t }}
            </button>
            <button
              dsBtn
              variant="ghost"
              size="sm"
              type="button"
              data-testid="settings-storage-open-explorer"
              (click)="openExplorer()"
            >
              <ds-icon name="external" size="sm" />{{ 'settings.storage.openExplorer' | t }}
            </button>
          </div>
        </div>
        <div class="settings-row" data-testid="settings-storage-contents">
          <div class="settings-row-text">
            <span class="settings-row-label">{{ 'settings.storage.contents.label' | t }}</span>
            <span class="settings-row-hint">{{ 'settings.storage.contents.hint' | t }}</span>
            <span class="settings-row-hint">
              {{ 'settings.storage.contents.settingsFile' | t: { path: settingsDir } }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <ds-dialog
      data-testid="settings-storage-picker"
      icon="folder"
      [heading]="'settings.storage.picker.title' | t"
      [closeLabel]="'common.cancel' | t"
      [open]="pickerOpen()"
      (closed)="pickerOpen.set(false)"
    >
      <p class="settings-storage-sim-note">
        <ds-pill icon="info">Storybook</ds-pill>{{ 'settings.storage.sim.note' | t }}
      </p>
      <ul class="settings-storage-options">
        @for (folder of pickerFolders(); track folder.path) {
          <li>
            <button
              type="button"
              class="settings-storage-option"
              [attr.data-testid]="'settings-storage-picker-' + (folder.path === appDataDir() ? 'current' : folder.kind)"
              (click)="pick(folder)"
            >
              <ds-icon name="folder" />
              <span class="settings-storage-option-text">
                <code>{{ folder.path }}</code>
                <span>{{ folder.note | t }}</span>
              </span>
            </button>
          </li>
        }
      </ul>
      <ng-container dialogFooter>
        <button dsBtn type="button" data-testid="settings-storage-picker-cancel" (click)="pickerOpen.set(false)">
          {{ 'common.cancel' | t }}
        </button>
      </ng-container>
    </ds-dialog>

    <ds-dialog
      data-testid="settings-storage-review"
      [icon]="reviewView()?.dbStep ? 'folder' : 'alert-triangle'"
      [danger]="!reviewView()?.dbStep"
      [heading]="(reviewView()?.dbStep ? 'settings.storage.review.title' : 'settings.storage.error.title') | t"
      [closeLabel]="'common.cancel' | t"
      [open]="review() !== null"
      (closed)="review.set(null)"
    >
      @if (review(); as folder) {
        @let view = reviewView()!;
        <div class="settings-storage-review">
          <span class="settings-storage-review-label">{{ 'settings.storage.review.to' | t }}</span>
          <code class="settings-storage-path" data-testid="settings-storage-review-path">{{ folder.path }}</code>
          @if (view.dbStep) {
            <p class="settings-storage-review-outcome">
              <ds-pill [kind]="view.pillKind" data-testid="settings-storage-review-kind">{{ view.pill | t }}</ds-pill>
              <span>{{ view.message | t }}</span>
            </p>
            <span class="settings-storage-review-label">{{ 'settings.storage.review.from' | t }}</span>
            <code class="settings-storage-path">{{ appDataDir() }}</code>
            <p class="settings-storage-review-note">
              <ds-icon name="shield" size="sm" />{{ 'settings.storage.review.keep' | t }}
            </p>
          } @else {
            <p class="settings-storage-review-error" data-testid="settings-storage-review-error">
              <ds-icon name="alert-circle" size="sm" />{{
                view.message | t: { found: newerDbVersion, supported: supportedDbVersion }
              }}
            </p>
            <p class="settings-storage-review-note">
              <ds-icon name="info" size="sm" />{{ 'settings.storage.error.stayed' | t: { path: appDataDir() } }}
            </p>
          }
        </div>
      }
      <ng-container dialogFooter>
        <button dsBtn type="button" data-testid="settings-storage-review-cancel" (click)="review.set(null)">
          {{ 'common.cancel' | t }}
        </button>
        @if (reviewView()?.dbStep) {
          <button
            dsBtn
            variant="primary"
            type="button"
            data-testid="settings-storage-review-confirm"
            (click)="confirmReview()"
          >
            {{ 'settings.storage.review.confirm' | t }}
          </button>
        } @else {
          <button
            dsBtn
            variant="primary"
            type="button"
            data-testid="settings-storage-review-choose"
            (click)="chooseAnother()"
          >
            <ds-icon name="folder" size="sm" />{{ 'settings.storage.review.chooseAnother' | t }}
          </button>
        }
      </ng-container>
    </ds-dialog>

    <dialog
      #switchDialog
      class="ds-dialog settings-storage-switch"
      data-testid="settings-storage-switch"
      aria-labelledby="settings-storage-switch-title"
      [attr.aria-busy]="switchError() ? null : true"
      (cancel)="$event.preventDefault()"
    >
      <header>
        <ds-icon [name]="switchError() ? 'alert-circle' : 'folder'" size="lg" [class.danger]="!!switchError()" />
        <h2 id="settings-storage-switch-title" class="t-dialog">
          {{ (switchError() ? 'settings.storage.switch.failed' : 'settings.storage.switch.title') | t }}
        </h2>
      </header>
      <div class="body">
        <code class="settings-storage-path">{{ switchTarget() }}</code>
        @if (!switchError()) {
          <p class="settings-storage-switch-wait">{{ 'settings.storage.switch.wait' | t }}</p>
          <ds-progress [value]="switchProgress()" />
        }
        <ol class="settings-storage-steps" aria-live="polite">
          @for (step of steps(); track step.id) {
            <li [attr.data-state]="step.state" [attr.data-testid]="'settings-storage-switch-step-' + step.id">
              <span class="settings-storage-step-mark">
                @if (step.state === 'running') {
                  <ds-dot kind="primary" pulse />
                } @else {
                  <ds-icon [name]="stepIcons[step.state]" size="sm" />
                }
              </span>
              <span>{{ step.label | t }}</span>
              <span class="visually-hidden">{{ 'settings.storage.switch.state.' + step.state | t }}</span>
            </li>
          }
        </ol>
        @if (switchError(); as error) {
          <div data-testid="settings-storage-switch-error">
            <ds-banner
              variant="danger"
              [dismissible]="false"
              [heading]="error | t"
              [message]="'settings.storage.error.stayed' | t: { path: appDataDir() }"
              [dismissLabel]="'common.dismiss' | t"
            />
          </div>
        }
      </div>
      @if (switchError()) {
        <footer>
          <button
            #switchClose
            dsBtn
            type="button"
            data-testid="settings-storage-switch-close"
            (click)="switchTarget.set(null)"
          >
            {{ 'settings.storage.switch.close' | t }}
          </button>
        </footer>
      }
    </dialog>
  `,
})
class SettingsStoragePreview {
  protected readonly scenario: SettingsScenario = inject(SETTINGS_SCENARIO);
  private readonly api: DesktopApi = inject(DesktopApi);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly injector: Injector = inject(Injector);

  protected readonly settingsDir: string = SETTINGS_DIR;
  protected readonly stepIcons: Record<StepState, string> = STEP_ICONS;
  protected readonly newerDbVersion: number = NEWER_DB_VERSION;
  protected readonly supportedDbVersion: number = SUPPORTED_DB_VERSION;

  protected readonly appDataDir = signal<string>(this.scenario.appDataDir);
  protected readonly pickerOpen = signal<boolean>(false);
  protected readonly checking = signal<boolean>(false);
  protected readonly review = signal<SampleFolder | null>(null);
  protected readonly switchTarget = signal<string | null>(null);
  protected readonly steps = signal<SwitchStep[]>([]);
  protected readonly switchError = signal<string | null>(null);
  protected readonly status = signal<FolderStatus>({
    freeGb: DEFAULT_FREE_GB,
    schema: CURRENT_SCHEMA,
    checkedAt: FIRST_CHECK_AT,
  });

  protected readonly isDefault = computed<boolean>(() => this.appDataDir() === this.scenario.defaultAppDataDir);
  protected readonly blocked = computed<boolean>(() => this.scenario.pipelinesActive > 0);
  protected readonly resetTooltip = computed<string>(() => {
    if (this.blocked())
      return this.i18n.t('settings.storage.blocked.message', { count: this.scenario.pipelinesActive });
    return this.isDefault() ? this.i18n.t('settings.storage.resetDisabled') : '';
  });
  protected readonly reviewView = computed<FolderView | null>(() => {
    const folder: SampleFolder | null = this.review();
    return folder ? FOLDER_VIEWS[folder.kind] : null;
  });
  protected readonly pickerFolders = computed<SampleFolder[]>(() => [
    { path: this.appDataDir(), kind: 'existing', note: 'settings.storage.sim.current', freeGb: this.status().freeGb },
    ...SAMPLE_FOLDERS.filter((folder) => folder.path !== this.appDataDir()),
  ]);
  protected readonly switchProgress = computed<number>(() => {
    const steps: SwitchStep[] = this.steps();
    const done: number = steps.filter((step) => step.state === 'done').length;
    return steps.length ? (done / steps.length) * 100 : 0;
  });

  private readonly switchDialog = viewChild.required<ElementRef<HTMLDialogElement>>('switchDialog');
  private readonly switchClose = viewChild<ElementRef<HTMLButtonElement>>('switchClose');

  constructor() {
    effect(() => {
      const element: HTMLDialogElement = this.switchDialog().nativeElement;
      if (this.switchTarget() !== null && !element.open) {
        element.showModal();
      } else if (this.switchTarget() === null && element.open) {
        element.close();
      }
    });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.appDataDir());
      this.toast.show({ kind: 'success', title: this.i18n.t('settings.storage.copied') });
    } catch {
      this.toast.show({ kind: 'danger', title: this.i18n.t('settings.storage.copyFailed') });
    }
  }

  protected async openExplorer(): Promise<void> {
    try {
      await this.api.openDataDir();
    } catch (error) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('settings.storage.openExplorerFailed'),
        message: String(error),
      });
    }
  }

  protected async pick(folder: SampleFolder): Promise<void> {
    this.pickerOpen.set(false);
    if (folder.path === this.appDataDir()) {
      this.toast.show({
        kind: 'info',
        title: this.i18n.t('settings.storage.same'),
        message: this.i18n.t('settings.storage.sameMsg'),
        autoHide: true,
      });
      return;
    }
    this.checking.set(true);
    await delay(CHECK_MS);
    this.checking.set(false);
    this.review.set(folder);
  }

  protected chooseAnother(): void {
    this.review.set(null);
    this.pickerOpen.set(true);
  }

  protected confirmReview(): void {
    const folder: SampleFolder | null = this.review();
    this.review.set(null);
    if (folder) void this.runSwitch(folder.path, FOLDER_VIEWS[folder.kind], folder.freeGb);
  }

  protected async reset(): Promise<void> {
    const path: string = this.scenario.defaultAppDataDir;
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('settings.storage.resetConfirm.title'),
      message: this.i18n.t('settings.storage.resetConfirm.message', { path }),
      confirmLabel: this.i18n.t('settings.storage.resetConfirm.confirm'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (confirmed) await this.runSwitch(path, EXISTING_VIEW, DEFAULT_FREE_GB);
  }

  private async runSwitch(path: string, view: FolderView, freeGb: number): Promise<void> {
    const ids: string[] = ['close', 'folders', view.dbStep ?? 'dbOpen', 'backend'];
    this.steps.set(ids.map((id) => ({ id, label: STEP_PREFIX + id, state: 'pending' })));
    this.switchError.set(null);
    this.switchTarget.set(path);
    for (const [index, id] of ids.entries()) {
      this.setStep(index, 'running');
      await delay(STEP_MS);
      if (view.failsAtDb && id === view.dbStep) {
        await this.rollback(index);
        return;
      }
      this.setStep(index, 'done');
    }
    this.switchTarget.set(null);
    this.appDataDir.set(path);
    this.status.set({ freeGb, schema: CURRENT_SCHEMA, checkedAt: currentTime() });
    this.toast.show({
      kind: 'success',
      title: this.i18n.t('settings.storage.switched', { path }),
      message: this.i18n.t('settings.storage.switchedMsg'),
    });
  }

  private async rollback(failedIndex: number): Promise<void> {
    this.setStep(failedIndex, 'failed');
    const rollback: SwitchStep = { id: 'rollback', label: STEP_PREFIX + 'rollback', state: 'running' };
    this.steps.update((steps) => [...steps.slice(0, failedIndex + 1), rollback]);
    await delay(STEP_MS);
    this.setStep(failedIndex + 1, 'done');
    this.switchError.set('settings.storage.error.upgradeFailed');
    afterNextRender(() => this.switchClose()?.nativeElement.focus(), { injector: this.injector });
  }

  private setStep(index: number, state: StepState): void {
    this.steps.update((steps) => steps.map((step, position) => (position === index ? { ...step, state } : step)));
  }
}

type CheckStatus = 'ok' | 'warning' | 'error';
type CheckCategory = 'storage' | 'database' | 'backend' | 'settings';

interface CheckResult {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  params?: TranslateParams;
}

interface CheckGroup {
  category: CheckCategory;
  checks: CheckResult[];
}

const CATEGORIES: CheckCategory[] = ['storage', 'database', 'backend', 'settings'];
const RUN_MS = 900;
const DOT: Record<CheckStatus, DotKind> = { ok: 'success', warning: 'warning', error: 'danger' };

function results(scenario: SettingsScenario, kind: DiagnosticsScenario): CheckResult[] {
  const issues = kind === 'issues';
  return [
    { id: 'storage.appData', category: 'storage', status: 'ok', params: { path: scenario.appDataDir } },
    { id: 'storage.settingsDir', category: 'storage', status: 'ok', params: { path: scenario.defaultAppDataDir } },
    {
      id: 'storage.diskSpace',
      category: 'storage',
      status: issues ? 'warning' : 'ok',
      params: { free: issues ? '0.8 GB' : '214 GB', drive: 'C:' },
    },
    { id: 'database.integrity', category: 'database', status: 'ok' },
    { id: 'backend.reachable', category: 'backend', status: issues ? 'error' : 'ok' },
    { id: 'settings.file', category: 'settings', status: 'ok' },
  ];
}

@Component({
  selector: 'ds-settings-diagnostics-preview',
  imports: [AreaStateComponent, ButtonDirective, DotComponent, IconComponent, PillComponent, TranslatePipe],
  template: `
    <section class="settings-section diagnostics" data-testid="diagnostics" [attr.aria-busy]="running()">
      <header class="settings-section-head">
        <h3>{{ 'diagnostics.title' | t }}</h3>
      </header>

      <div class="diagnostics-body">
        <div class="diagnostics-head">
          <h4>{{ 'diagnostics.selfCheck' | t }}</h4>
          <span class="meta" role="status" data-testid="diagnostics-last-run">{{ lastRunText() }}</span>
          @if (!engineError()) {
            <button dsBtn type="button" size="sm" data-testid="diagnostics-run" [loading]="running()" (click)="run()">
              {{ 'diagnostics.run' | t }}
            </button>
          }
        </div>

        @if (engineError()) {
          <ds-area-state
            kind="error"
            compact
            data-testid="diagnostics-engine-error"
            [heading]="'diagnostics.engineError.title' | t"
            [description]="'diagnostics.engineError.message' | t"
          >
            <button dsBtn type="button" size="sm" data-testid="diagnostics-retry" (click)="run()">
              {{ 'common.retry' | t }}
            </button>
          </ds-area-state>
        } @else {
          @for (group of groups(); track group.category) {
            <div class="diagnostics-group" data-testid="diagnostics-group" [attr.data-category]="group.category">
              <h5>{{ 'diagnostics.category.' + group.category | t }}</h5>
              <ul class="diagnostics-list">
                @for (item of group.checks; track item.id) {
                  <li
                    class="diagnostics-check"
                    data-testid="diagnostics-check"
                    [attr.data-check-id]="item.id"
                    [attr.data-status]="running() ? 'running' : item.status"
                  >
                    @if (running()) {
                      <ds-dot pulse />
                      <span class="diagnostics-check-line">
                        <b>{{ 'diagnostics.check.' + item.id + '.name' | t }}</b>
                      </span>
                      <ds-pill kind="info">{{ 'diagnostics.checking' | t }}</ds-pill>
                    } @else {
                      <ds-dot [kind]="dot[item.status]" />
                      <div class="diagnostics-check-text">
                        <p class="diagnostics-check-line">
                          <b>{{ 'diagnostics.check.' + item.id + '.name' | t }}</b>
                          · {{ 'diagnostics.check.' + item.id + '.' + item.status | t: item.params }}
                        </p>
                        @if (item.status !== 'ok') {
                          <p class="diagnostics-check-fix" data-testid="diagnostics-check-fix">
                            <b>{{ 'diagnostics.fixLabel' | t }}</b>
                            {{ 'diagnostics.check.' + item.id + '.fix' | t: item.params }}
                          </p>
                        }
                      </div>
                      <span
                        class="diagnostics-check-status"
                        data-testid="diagnostics-check-status"
                        [class.visually-hidden]="item.status === 'ok'"
                      >
                        {{ 'diagnostics.status.' + item.status | t }}
                      </span>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        }
      </div>
    </section>
  `,
})
class SettingsDiagnosticsPreview implements OnInit {
  protected readonly scenario: SettingsScenario = inject(SETTINGS_SCENARIO);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  protected readonly dot: Record<CheckStatus, DotKind> = DOT;
  protected readonly running = signal<boolean>(false);
  protected readonly engineError = signal<boolean>(false);
  protected readonly checks = signal<CheckResult[]>(results(this.scenario, this.scenario.diagnostics));
  protected readonly lastRun = signal<Date | null>(null);

  protected readonly groups: Signal<CheckGroup[]> = computed(() =>
    CATEGORIES.map((category) => ({
      category,
      checks: this.checks().filter((item) => item.category === category),
    })).filter((group) => group.checks.length > 0),
  );
  protected readonly lastRunText: Signal<string> = computed(() => {
    const date = this.lastRun();
    if (!date) return this.i18n.t('diagnostics.neverRun');
    const time = new Intl.DateTimeFormat(this.i18n.language(), { timeStyle: 'short' }).format(date);
    return this.i18n.t('diagnostics.lastRun', { time });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  ngOnInit(): void {
    this.run();
  }

  protected run(): void {
    this.running.set(true);
    this.engineError.set(false);
    this.later(RUN_MS, () => {
      this.running.set(false);
      if (this.scenario.diagnostics === 'engineError') {
        this.engineError.set(true);
        return;
      }
      this.lastRun.set(new Date());
      this.checks.set(results(this.scenario, this.scenario.diagnostics));
    });
  }

  private later(ms: number, action: () => void): void {
    this.timers.push(setTimeout(action, ms));
  }
}

interface DetailLine {
  id: string;
  label: string;
  name: string;
  value: string;
}

interface BackendView {
  kind: PillKind;
  icon: string;
  label: string;
  copyText: string;
}

const APP_NAME = 'Dreamer Studio';
const AUTHOR = 'datntdev';
const DEV_TAG = 'dev';
const BUILD_DATE = '2026-10-19';
const LICENSE = 'MIT';
const REPOSITORY_URL = 'https://github.com/datntdev0/projects.dreamer-studio';
const ISSUES_URL = `${REPOSITORY_URL}/issues`;
const BACKEND_ADDRESS = '127.0.0.1:47123';

const SYSTEM_LINES: DetailLine[] = [
  { id: 'electron', label: 'about.electron', name: 'Electron', value: '44.9.0' },
  { id: 'chromium', label: 'about.chromium', name: 'Chromium', value: '150.0.7800.45' },
  { id: 'node', label: 'about.node', name: 'Node.js', value: '24.11.0' },
  { id: 'windows', label: 'about.windows', name: 'Windows', value: '10.0.19045 (x64)' },
  { id: 'database', label: 'about.databaseSchema', name: 'Database schema', value: '0.0.0_1' },
];

const BACKEND_VIEWS: Record<BackendState, BackendView> = {
  running: { kind: 'success', icon: 'check', label: 'about.backendRunning', copyText: `Running · ${BACKEND_ADDRESS}` },
  starting: { kind: 'warning', icon: 'clock', label: 'about.backendStarting', copyText: 'Starting' },
  unavailable: { kind: 'danger', icon: 'alert-circle', label: 'about.backendUnavailable', copyText: 'Not running' },
};

@Component({
  selector: 'ds-settings-about-preview',
  imports: [ButtonDirective, IconComponent, PillComponent, TranslatePipe],
  template: `
    <section class="settings-section about" data-testid="about">
      <header class="settings-section-head">
        <h3>{{ 'about.title' | t }}</h3>
      </header>

      <div class="about-body">
        <div class="about-head">
          <p class="about-title" data-testid="about-title">
            <b data-testid="about-name">{{ 'app.name' | t }}</b>
            @if (loading()) {
              <span class="skeleton about-skeleton"></span>
            } @else {
              <span class="num" data-testid="about-version">{{ versionLabel() }}</span>
            }
            <span class="about-sep">·</span>
            <span class="muted">{{ 'about.by' | t: { author: author } }}</span>
            @if (scenario.devBuild) {
              <ds-pill kind="info" icon="terminal" data-testid="about-dev-build">{{ 'about.devBuild' | t }}</ds-pill>
            }
          </p>
          <div class="about-links">
            <a
              class="about-link"
              data-testid="about-repository"
              target="_blank"
              rel="noopener noreferrer"
              [href]="repositoryUrl"
              [attr.aria-label]="'about.opensInBrowser' | t: { label: ('about.repository' | t) }"
            >
              <ds-icon name="external" size="sm" />{{ 'about.repository' | t }}
            </a>
            <a
              class="about-link"
              data-testid="about-issues"
              target="_blank"
              rel="noopener noreferrer"
              [href]="issuesUrl"
              [attr.aria-label]="'about.opensInBrowser' | t: { label: ('about.reportIssue' | t) }"
            >
              <ds-icon name="external" size="sm" />{{ 'about.reportIssue' | t }}
            </a>
          </div>
        </div>

        <dl class="settings-kv" data-testid="about-details">
          <dt>{{ 'about.buildDate' | t }}</dt>
          <dd data-testid="about-build-date">{{ buildDate() }}</dd>
          <dt>{{ 'about.license' | t }}</dt>
          <dd data-testid="about-license">{{ license }}</dd>
          @for (line of systemLines; track line.id) {
            <dt>{{ line.label | t }}</dt>
            <dd class="num" [attr.data-testid]="'about-' + line.id">
              @if (loading()) {
                <span class="skeleton about-skeleton"></span>
              } @else {
                {{ line.value }}
              }
            </dd>
          }
          <dt>{{ 'about.aiBackend' | t }}</dt>
          <dd data-testid="about-backend">
            <ds-pill [kind]="backend().kind" [icon]="backend().icon">
              {{ backend().label | t: { address: backendAddress } }}
            </ds-pill>
          </dd>
        </dl>

        <div class="about-actions">
          <button dsBtn size="sm" type="button" data-testid="about-copy" [disabled]="loading()" (click)="copy()">
            <ds-icon name="copy" size="sm" />{{ 'about.copy' | t }}
          </button>
        </div>
      </div>
    </section>
  `,
})
class SettingsAboutPreview {
  protected readonly scenario: SettingsScenario = inject(SETTINGS_SCENARIO);
  private readonly appInfo: AppInfoStore = inject(AppInfoStore);
  private readonly backendStatus: BackendStatus = inject(BackendStatus);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);

  protected readonly author: string = AUTHOR;
  protected readonly license: string = LICENSE;
  protected readonly repositoryUrl: string = REPOSITORY_URL;
  protected readonly issuesUrl: string = ISSUES_URL;
  protected readonly backendAddress: string = BACKEND_ADDRESS;
  protected readonly systemLines: DetailLine[] = SYSTEM_LINES;

  protected readonly loading = computed<boolean>(() => this.appInfo.state() === 'loading');
  private readonly version = computed<string>(() => this.appInfo.info()?.version ?? '');
  protected readonly versionLabel = computed<string>(() =>
    this.scenario.devBuild ? `${this.version()} ${DEV_TAG}` : this.version(),
  );
  protected readonly buildDate = computed<string>(() => (this.scenario.devBuild ? DEV_TAG : BUILD_DATE));
  protected readonly backend = computed<BackendView>(() => BACKEND_VIEWS[this.backendStatus.state()]);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.versionText());
      this.toast.show({ kind: 'success', title: this.i18n.t('about.copied') });
    } catch {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('about.copyFailed'),
        message: this.i18n.t('about.copyFailedHint'),
      });
    }
  }

  private versionText(): string {
    return [
      `${APP_NAME} ${this.versionLabel()}`,
      `Build date: ${this.buildDate()}`,
      ...SYSTEM_LINES.map((line) => `${line.name}: ${line.value}`),
      `AI backend: ${this.backend().copyText}`,
    ].join('\n');
  }
}

interface NavItem {
  section: SettingsSection;
  icon: string;
}

const NAV_ICONS: Record<SettingsSection, string> = {
  general: 'sliders',
  diagnostics: 'shield',
};

const UPCOMING_ICONS: Record<string, string> = {
  llm: 'sparkles',
};

const SECTION_ALIASES: Record<string, SettingsSection> = {
  storage: 'general',
  pipeline: 'general',
  about: 'diagnostics',
};

@Component({
  selector: 'ds-settings-preview-page',
  host: { class: 'ds-page settings-page' },
  imports: [
    RouterLink,
    BannerComponent,
    IconComponent,
    AreaStateComponent,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
    PageTitleDirective,
    SettingsGeneralPreview,
    SettingsStoragePreview,
    SettingsPipelinePreview,
    SettingsDiagnosticsPreview,
    SettingsAboutPreview,
  ],
  template: `
    <div class="ds-page-toolbar" data-testid="page-toolbar">
      <h1 dsPageTitle>{{ 'nav.settings' | t }}</h1>
      <div class="ds-page-actions">
        <span class="meta" data-testid="settings-autosave">{{ 'settings.page.autosave' | t }}</span>
      </div>
    </div>
    <div class="settings-layout" data-testid="settings-page">
      <nav class="settings-nav" [attr.aria-label]="'settings.page.navLabel' | t" data-testid="settings-nav">
        @for (item of navItems; track item.section) {
          <a
            class="settings-nav-item"
            [routerLink]="['/settings', item.section]"
            [attr.aria-current]="item.section === section() ? 'page' : null"
            [attr.data-section]="item.section"
            data-testid="settings-nav-item"
          >
            <ds-icon [name]="item.icon" />
            <span class="label">{{ 'settings.page.nav.' + item.section | t }}</span>
          </a>
        }
        @for (item of upcoming; track item.id) {
          <span
            class="settings-nav-item"
            aria-disabled="true"
            tabindex="0"
            [dsTooltip]="'settings.page.plannedFor' | t: { release: item.release }"
            [attr.data-section]="item.id"
            data-testid="settings-nav-upcoming"
          >
            <ds-icon [name]="upcomingIcon(item)" />
            <span class="label">{{ 'settings.page.nav.' + item.id | t }}</span>
            <ds-pill>{{ 'settings.page.comingLater' | t }}</ds-pill>
          </span>
        }
      </nav>
      <div class="settings-main" data-testid="settings-main">
        @if (scenario.loading) {
          <div class="settings-loading">
            <ds-area-state kind="loading" [heading]="'settings.page.loading' | t" data-testid="settings-loading" />
          </div>
        } @else {
          <div class="settings-content" data-testid="settings-content">
            @if (showResetNotice()) {
              <ds-banner
                class="settings-notice"
                variant="warning"
                [heading]="'settings.page.resetNotice.title' | t"
                [message]="'settings.page.resetNotice.message' | t"
                [dismissLabel]="'common.dismiss' | t"
                data-testid="settings-reset-notice"
                (dismiss)="noticeDismissed.set(true)"
              />
            }
            @switch (section()) {
              @case ('diagnostics') {
                <div class="settings-cols" data-testid="settings-diagnostics-pane">
                  <div class="settings-col">
                    <ds-settings-about-preview />
                  </div>
                  <div class="settings-col">
                    <ds-settings-diagnostics-preview />
                  </div>
                </div>
              }
              @default {
                <ds-settings-general-preview />
                <ds-settings-pipeline-preview />
                <ds-settings-storage-preview />
              }
            }
          </div>
        }
      </div>
    </div>
  `,
})
class SettingsPreviewPage {
  private readonly router: Router = inject(Router);
  protected readonly scenario: SettingsScenario = inject(SETTINGS_SCENARIO);
  protected readonly navItems: NavItem[] = SETTINGS_SECTIONS.map((section: SettingsSection) => ({
    section,
    icon: NAV_ICONS[section],
  }));
  protected readonly upcoming: UpcomingSettingsSection[] = UPCOMING_SETTINGS_SECTIONS;
  protected readonly noticeDismissed = signal<boolean>(false);
  protected readonly section = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => toSection(this.router.url)),
    ),
    { initialValue: toSection(this.router.url) },
  );

  protected upcomingIcon(item: UpcomingSettingsSection): string {
    return UPCOMING_ICONS[item.id] ?? 'clock';
  }

  protected showResetNotice(): boolean {
    return this.scenario.settingsReset && !this.noticeDismissed();
  }
}

function toSection(url: string): SettingsSection {
  const id: string = url.split(/[?#]/)[0].split('/')[2] ?? '';
  return SETTINGS_SECTIONS.find((section: SettingsSection) => section === id) ?? SECTION_ALIASES[id] ?? 'general';
}

interface SettingsArgs {
  route: string;
  scenario: SettingsScenario;
}

@Component({
  selector: 'ds-settings-shell-demo',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div>',
})
class SettingsShellDemoComponent implements OnInit {
  readonly route = input<string>('/settings/general');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

function previewRoutes(): Routes {
  const modules = MODULES.map((module) =>
    module.id === 'settings' ? { ...module, page: SettingsPreviewPage, detailRoute: true } : module,
  );
  return buildRoutes(modules, ComingSoonPage);
}

const meta: Meta<SettingsArgs> = {
  title: 'Pages/Settings',
  parameters: { layout: 'fullscreen' },
  args: { route: '/settings/general', scenario: DEFAULT_SCENARIO },
  decorators: [
    moduleMetadata({ imports: [SettingsShellDemoComponent] }),
    (story, context) => {
      const result = story();
      const providers = [
        provideRouter(previewRoutes(), withHashLocation()),
        provideDesktopApi({ backend: 'running' }),
        { provide: SETTINGS_SCENARIO, useValue: context.args.scenario },
      ];
      return {
        ...result,
        applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
      };
    },
  ],
  render: (args) => ({
    props: args,
    template: '<ds-settings-shell-demo [route]="route" />',
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
