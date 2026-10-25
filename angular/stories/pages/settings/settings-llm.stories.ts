import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import type { PillKind } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { LLM_CLOUD_PROVIDERS, LLM_FEATURE_IDS, LLM_MODEL_SUGGESTIONS, LLM_STATE_MIXED } from '../../fixtures/llm';
import { LLM_STATE_NONE, LlmStoryStore } from '../../fixtures/llm';
import type { LlmChoice, LlmCliId, LlmCliState, LlmCliStatus, LlmFeatureId, LlmStoryState } from '../../fixtures/llm';
import type { LlmTestResult } from '../../fixtures/llm';
import { NgTemplateOutlet } from '@angular/common';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

interface CliInfo {
  signIn: string;
  command: string;
  example: string;
  browsePath: string;
  version: string;
  executable: RegExp;
}

type PathError = 'required' | 'invalid';

interface CliProblem {
  code: string;
  failedAfter: string | null;
  params: TranslateParams;
}

interface CliRow {
  cli: LlmCliStatus;
  pill: StatePill;
  testedIn: string | null;
  problem: CliProblem | null;
}

interface StatePill {
  kind: PillKind;
  icon: string;
  label: string;
}

const KEY = 'settings.llm.providers.';
const DETECT_MS = 1000;
const TEST_MS = 1500;
const PATH_CHECK_MS = 800;
const TEST_TIMEOUT_SECONDS = 30;
const DEFAULT_EXIT_CODE = 1;

const CLI_INFO: Record<LlmCliId, CliInfo> = {
  claude: {
    signIn: 'claude',
    command: 'claude',
    example: 'claude.cmd',
    browsePath: 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd',
    version: '2.4.1',
    executable: /(^|[\\/])claude(\.cmd|\.exe)?$/i,
  },
  codex: {
    signIn: 'codex login',
    command: 'codex',
    example: 'codex.cmd',
    browsePath: 'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd',
    version: '0.48.0',
    executable: /(^|[\\/])codex(\.cmd|\.exe)?$/i,
  },
  antigravity: {
    signIn: 'agy',
    command: 'agy',
    example: 'agy.exe',
    browsePath: 'D:\\Tools\\antigravity\\agy.exe',
    version: '1.1.8',
    executable: /(^|[\\/])(agy|antigravity)(\.cmd|\.exe)?$/i,
  },
};

const TEST_OUTCOMES: Record<LlmCliId, LlmTestResult> = {
  claude: { state: 'ok', durationMs: 4200, errorCode: null },
  codex: { state: 'ok', durationMs: 5600, errorCode: null },
  antigravity: { state: 'error', durationMs: 900, errorCode: 'LLM_NOT_SIGNED_IN' },
};

const IDLE_TEST: LlmTestResult = { state: 'idle', durationMs: null, errorCode: null };

const STATE_PILLS: Record<LlmCliState, StatePill> = {
  installed: { kind: 'success', icon: 'check', label: `${KEY}state.installed` },
  notInstalled: { kind: 'neutral', icon: 'minus', label: `${KEY}state.notInstalled` },
  invalidPath: { kind: 'danger', icon: 'alert-circle', label: `${KEY}state.invalidPath` },
};

const DETECTING_PILL: StatePill = { kind: 'info', icon: 'retry', label: `${KEY}detecting` };

function notInstalled(cli: LlmCliStatus): LlmCliStatus {
  return { ...cli, state: 'notInstalled', version: null, path: null, customPath: false, test: IDLE_TEST };
}

@Component({
  selector: 'ds-llm-providers-preview',
  imports: [
    BannerComponent,
    ButtonDirective,
    DialogComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  template: `
    <section
      class="settings-section llm-providers"
      aria-labelledby="settings-llm-providers-title"
      id="settings-llm-providers"
      data-testid="settings-llm-providers"
      [attr.aria-busy]="state().detecting"
    >
      <header class="settings-section-head">
        <h3 id="settings-llm-providers-title">{{ 'settings.llm.providers.title' | t }}</h3>
        <div class="settings-section-actions">
          <button
            dsBtn
            variant="ghost"
            size="sm"
            type="button"
            data-testid="settings-llm-providers-detect"
            [loading]="state().detecting"
            (click)="detect()"
          >
            @if (state().detecting) {
              {{ 'settings.llm.providers.detecting' | t }}
            } @else {
              <ds-icon name="retry" size="sm" />{{ 'settings.llm.providers.detect' | t }}
            }
          </button>
        </div>
      </header>

      <p class="llm-providers-note" data-testid="settings-llm-providers-sandbox">
        <ds-icon name="shield" size="sm" />{{ 'settings.llm.providers.sandboxHint' | t }}
      </p>

      @if (noneInstalled()) {
        <div class="llm-providers-banner" data-testid="settings-llm-providers-none">
          <ds-banner
            variant="warning"
            [dismissible]="false"
            [heading]="'settings.llm.providers.none.title' | t"
            [message]="'settings.llm.providers.none.message' | t"
            [dismissLabel]="'common.dismiss' | t"
          />
        </div>
      }

      <div class="settings-group">
        <h4>{{ 'settings.llm.providers.cliGroup' | t }}</h4>
        @for (row of rows(); track row.cli.id) {
          @let cli = row.cli;
          <div
            class="settings-row llm-providers-cli"
            data-testid="settings-llm-cli"
            [attr.data-cli]="cli.id"
            [attr.data-state]="cli.state"
            [attr.data-test-state]="cli.test.state"
          >
            <ds-icon class="llm-providers-icon" name="terminal" />
            <div class="settings-row-text">
              <span class="llm-providers-cli-head">
                <span class="settings-row-label" data-testid="settings-llm-cli-name">{{ cli.name }}</span>
                <ds-pill data-testid="settings-llm-cli-state" [kind]="row.pill.kind" [icon]="row.pill.icon">
                  {{ row.pill.label | t }}
                </ds-pill>
                @if (cli.version && !state().detecting) {
                  <span class="meta num" data-testid="settings-llm-cli-version">
                    {{ 'settings.llm.providers.version' | t: { version: cli.version } }}
                  </span>
                }
              </span>

              @if (cli.path) {
                <span class="llm-providers-path-line">
                  <code
                    class="llm-providers-path"
                    data-testid="settings-llm-cli-path"
                    dsTooltipWhenTruncated
                    [dsTooltip]="cli.path"
                    >{{ cli.path }}</code
                  >
                  <span class="settings-row-hint" data-testid="settings-llm-cli-path-source">
                    {{
                      (cli.customPath ? 'settings.llm.providers.path.custom' : 'settings.llm.providers.path.auto') | t
                    }}
                  </span>
                  <button
                    dsBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    data-testid="settings-llm-cli-change-path"
                    [iconOnly]="true"
                    [disabled]="state().detecting"
                    [attr.aria-label]="('settings.llm.providers.changePath' | t) + ' · ' + cli.name"
                    [dsTooltip]="'settings.llm.providers.changePath' | t"
                    (click)="openPathDialog(cli)"
                  >
                    <ds-icon name="pencil" size="sm" />
                  </button>
                  @if (cli.customPath) {
                    <button
                      dsBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      data-testid="settings-llm-cli-clear-path"
                      [iconOnly]="true"
                      [disabled]="state().detecting"
                      [attr.aria-label]="('settings.llm.providers.clearPath' | t) + ' · ' + cli.name"
                      [dsTooltip]="'settings.llm.providers.clearPath' | t"
                      (click)="clearPath(cli.id)"
                    >
                      <ds-icon name="undo" size="sm" />
                    </button>
                  }
                </span>
              } @else {
                <span class="settings-row-hint" data-testid="settings-llm-cli-not-found">
                  {{ 'settings.llm.providers.notFound' | t }}
                </span>
              }

              <div class="llm-providers-result" role="status" data-testid="settings-llm-cli-result">
                @if (cli.test.state === 'running') {
                  <span class="visually-hidden">{{ 'settings.llm.providers.testing' | t }}</span>
                } @else if (row.testedIn) {
                  <span class="llm-providers-ok" data-testid="settings-llm-cli-test-ok">
                    <ds-icon name="check" size="sm" />{{
                      'settings.llm.providers.testOk' | t: { seconds: row.testedIn }
                    }}
                  </span>
                } @else if (row.problem; as problem) {
                  <p class="llm-providers-error" data-testid="settings-llm-cli-error" [attr.data-code]="problem.code">
                    <ds-icon name="alert-circle" size="sm" />
                    <span>
                      @if (problem.failedAfter) {
                        <b>{{ 'settings.llm.providers.testFailed' | t: { seconds: problem.failedAfter } }}</b>
                        ·
                      }
                      {{ 'settings.llm.providers.error.' + problem.code + '.message' | t: problem.params }}
                    </span>
                  </p>
                  <p class="llm-providers-fix" data-testid="settings-llm-cli-fix">
                    <b>{{ 'settings.llm.providers.fixLabel' | t }}</b>
                    {{ 'settings.llm.providers.error.' + problem.code + '.fix' | t: problem.params }}
                  </p>
                }
              </div>
            </div>

            <div class="settings-row-control">
              @if (cli.state === 'installed') {
                <button
                  dsBtn
                  size="sm"
                  type="button"
                  data-testid="settings-llm-cli-test"
                  [loading]="cli.test.state === 'running'"
                  [disabled]="state().detecting"
                  [dsTooltip]="'settings.llm.providers.testHint' | t: { name: cli.name }"
                  (click)="test(cli.id)"
                >
                  @if (cli.test.state === 'running') {
                    {{ 'settings.llm.providers.testing' | t }}
                  } @else {
                    <ds-icon name="play" size="sm" />{{ 'settings.llm.providers.test' | t }}
                  }
                </button>
              } @else if (!cli.path) {
                <button
                  dsBtn
                  size="sm"
                  type="button"
                  data-testid="settings-llm-cli-set-path"
                  [disabled]="state().detecting"
                  (click)="openPathDialog(cli)"
                >
                  <ds-icon name="folder" size="sm" />{{ 'settings.llm.providers.setPath' | t }}
                </button>
              }
            </div>
          </div>
        }
      </div>

      <div class="settings-group llm-providers-cloud" data-testid="settings-llm-providers-cloud">
        <h4>{{ 'settings.llm.providers.cloudGroup' | t }}</h4>
        <span class="settings-row-hint llm-providers-cloud-hint">{{ 'settings.llm.providers.cloudHint' | t }}</span>
        @for (provider of cloudProviders; track provider) {
          <div class="settings-row" data-testid="settings-llm-cloud" [attr.data-provider]="provider">
            <ds-icon class="llm-providers-icon" name="key" />
            <div class="settings-row-text">
              <span class="settings-row-label">{{ provider }}</span>
            </div>
            <div class="settings-row-control">
              <ds-pill icon="clock" data-testid="settings-llm-cloud-soon">{{ 'common.soon' | t }}</ds-pill>
            </div>
          </div>
        }
      </div>

      <ds-dialog
        data-testid="settings-llm-cli-path-dialog"
        icon="terminal"
        [heading]="'settings.llm.providers.dialog.title' | t: { name: dialogCli()?.name ?? '' }"
        [closeLabel]="'common.cancel' | t"
        [open]="dialogCli() !== null"
        (closed)="closePathDialog()"
      >
        @if (dialogCli(); as cli) {
          <ds-field
            controlId="settings-llm-cli-path-input"
            required
            [label]="'settings.llm.providers.dialog.label' | t"
            [hint]="'settings.llm.providers.dialog.hint' | t: { name: cli.name, example: info(cli.id).example }"
            [error]="pathErrorText()"
          >
            <span class="llm-providers-path-input">
              <input
                id="settings-llm-cli-path-input"
                autofocus
                class="ds-input mono"
                type="text"
                spellcheck="false"
                autocomplete="off"
                data-testid="settings-llm-cli-path-input"
                [value]="pathDraft()"
                [attr.placeholder]="info(cli.id).browsePath"
                [attr.aria-invalid]="pathError() ? true : null"
                (input)="onPathInput($event)"
                (keydown.enter)="savePath(cli)"
              />
              <button dsBtn type="button" data-testid="settings-llm-cli-path-browse" (click)="browse(cli.id)">
                <ds-icon name="folder" size="sm" />{{ 'settings.llm.providers.dialog.browse' | t }}
              </button>
            </span>
          </ds-field>
        }
        <ng-container dialogFooter>
          <button dsBtn type="button" data-testid="settings-llm-cli-path-cancel" (click)="closePathDialog()">
            {{ 'common.cancel' | t }}
          </button>
          <button
            dsBtn
            variant="primary"
            type="button"
            data-testid="settings-llm-cli-path-save"
            [loading]="checkingPath()"
            (click)="savePath(dialogCli()!)"
          >
            {{ (checkingPath() ? 'settings.llm.providers.dialog.checking' : 'settings.llm.providers.dialog.save') | t }}
          </button>
        </ng-container>
      </ds-dialog>
    </section>
  `,
})
class LlmProvidersPreviewComponent implements OnInit {
  private readonly i18n: I18nService = inject(I18nService);
  private readonly timers: Set<ReturnType<typeof setTimeout>> = new Set();
  private autoDetected: Partial<Record<LlmCliId, LlmCliStatus>> = {};

  protected readonly state = inject(LlmStoryStore).state;
  protected readonly cloudProviders: string[] = LLM_CLOUD_PROVIDERS;
  protected readonly dialogCli = signal<LlmCliStatus | null>(null);
  protected readonly pathDraft = signal<string>('');
  protected readonly pathError = signal<PathError | null>(null);
  protected readonly checkingPath = signal<boolean>(false);

  protected readonly noneInstalled: Signal<boolean> = computed(
    () => !this.state().detecting && this.state().clis.every((cli) => cli.state !== 'installed'),
  );

  protected readonly rows: Signal<CliRow[]> = computed(() =>
    this.state().clis.map((cli) => ({
      cli,
      pill: this.state().detecting ? DETECTING_PILL : STATE_PILLS[cli.state],
      testedIn: cli.test.state === 'ok' ? this.seconds(cli.test.durationMs) : null,
      problem: this.problemOf(cli),
    })),
  );

  protected readonly pathErrorText: Signal<string> = computed(() => {
    const cli: LlmCliStatus | null = this.dialogCli();
    if (!cli || !this.pathError()) return '';
    if (this.pathError() === 'required') return this.i18n.t(`${KEY}dialog.required`);
    const params: TranslateParams = this.paramsOf(cli);
    return `${this.i18n.t(`${KEY}error.LLM_PATH_INVALID.message`, params)} ${this.i18n.t(`${KEY}error.LLM_PATH_INVALID.fix`, params)}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  ngOnInit(): void {
    for (const cli of this.state().clis) {
      this.autoDetected[cli.id] = cli.customPath ? notInstalled(cli) : cli;
    }
    this.detect();
  }

  protected info(id: LlmCliId): CliInfo {
    return CLI_INFO[id];
  }

  protected detect(): void {
    if (this.state().detecting) return;
    this.state.update((state) => ({ ...state, detecting: true }));
    this.later(DETECT_MS, () =>
      this.state.update((state) => ({
        ...state,
        detecting: false,
        clis: state.clis.map((cli) => (cli.customPath ? cli : this.redetected(cli))),
      })),
    );
  }

  protected test(id: LlmCliId): void {
    this.patchCli(id, { test: { state: 'running', durationMs: null, errorCode: null } });
    this.later(TEST_MS, () => this.patchCli(id, { test: TEST_OUTCOMES[id] }));
  }

  protected clearPath(id: LlmCliId): void {
    this.patchCli(id, { customPath: false });
    this.detect();
  }

  protected openPathDialog(cli: LlmCliStatus): void {
    this.pathDraft.set(cli.customPath ? (cli.path ?? '') : '');
    this.pathError.set(null);
    this.dialogCli.set(cli);
  }

  protected closePathDialog(): void {
    this.dialogCli.set(null);
    this.checkingPath.set(false);
  }

  protected onPathInput(event: Event): void {
    this.pathDraft.set((event.target as HTMLInputElement).value);
    this.pathError.set(null);
  }

  protected browse(id: LlmCliId): void {
    this.pathDraft.set(CLI_INFO[id].browsePath);
    this.pathError.set(null);
  }

  protected savePath(cli: LlmCliStatus): void {
    const path: string = this.pathDraft().trim();
    if (this.checkingPath()) return;
    if (!path) {
      this.pathError.set('required');
      return;
    }
    this.checkingPath.set(true);
    this.later(PATH_CHECK_MS, () => {
      this.checkingPath.set(false);
      if (!CLI_INFO[cli.id].executable.test(path)) {
        this.pathError.set('invalid');
        return;
      }
      this.patchCli(cli.id, {
        state: 'installed',
        version: CLI_INFO[cli.id].version,
        path,
        customPath: true,
        test: IDLE_TEST,
      });
      this.closePathDialog();
    });
  }

  private redetected(cli: LlmCliStatus): LlmCliStatus {
    const found: LlmCliStatus = this.autoDetected[cli.id] ?? notInstalled(cli);
    const unchanged: boolean = found.path === cli.path && found.version === cli.version;
    return { ...found, test: unchanged ? cli.test : IDLE_TEST };
  }

  private problemOf(cli: LlmCliStatus): CliProblem | null {
    if (cli.state === 'invalidPath') {
      return { code: 'LLM_PATH_INVALID', failedAfter: null, params: this.paramsOf(cli) };
    }
    if (cli.test.state === 'error' && cli.test.errorCode) {
      return { code: cli.test.errorCode, failedAfter: this.seconds(cli.test.durationMs), params: this.paramsOf(cli) };
    }
    return null;
  }

  private paramsOf(cli: LlmCliStatus): TranslateParams {
    const info: CliInfo = CLI_INFO[cli.id];
    return {
      name: cli.name,
      signIn: info.signIn,
      command: info.command,
      example: info.example,
      seconds: TEST_TIMEOUT_SECONDS,
      code: DEFAULT_EXIT_CODE,
    };
  }

  private seconds(durationMs: number | null): string {
    const format = new Intl.NumberFormat(this.i18n.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return format.format((durationMs ?? 0) / 1000);
  }

  private patchCli(id: LlmCliId, patch: Partial<LlmCliStatus>): void {
    this.state.update((state) => ({
      ...state,
      clis: state.clis.map((cli) => (cli.id === id ? { ...cli, ...patch } : cli)),
    }));
  }

  private later(ms: number, action: () => void): void {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, ms);
    this.timers.add(timer);
  }
}

type SlotKey = 'default' | LlmFeatureId;

type ProblemKey = 'noDefault' | 'defaultUnavailable' | 'notInstalled' | 'invalidPath';

interface CliOption {
  value: string;
  label: string;
  disabled: boolean;
}

interface LlmProblem {
  key: ProblemKey;
  cli: string;
  showLink: boolean;
}

interface LlmSlot {
  key: SlotKey;
  choice: LlmChoice | null;
  inherited: LlmChoice | null;
  options: CliOption[];
  selectDisabled: boolean;
  suggestions: string[];
  problem: LlmProblem | null;
}

const PREFIX = 'settings.llm.features.';
const PROVIDERS_SELECTOR = '#settings-llm-providers, [data-testid="settings-llm-providers"]';

@Component({
  selector: 'ds-llm-features-preview',
  imports: [BannerComponent, ButtonDirective, IconComponent, NgTemplateOutlet, TranslatePipe],
  template: `
    <section
      id="settings-llm-features"
      class="settings-section llm-features"
      aria-labelledby="settings-llm-features-title"
      data-testid="settings-llm-features"
    >
      <header class="settings-section-head">
        <h3 id="settings-llm-features-title" tabindex="-1">{{ 'settings.llm.features.title' | t }}</h3>
        <div class="settings-section-actions">
          <button
            dsBtn
            variant="ghost"
            size="sm"
            type="button"
            data-testid="settings-llm-features-reset"
            (click)="reset()"
          >
            <ds-icon name="undo" size="sm" />{{ 'settings.page.reset' | t }}
          </button>
        </div>
      </header>
      @if (noCliInstalled()) {
        <ds-banner
          class="llm-features-notice"
          variant="info"
          [dismissible]="false"
          [heading]="'settings.llm.features.noCli.title' | t"
          [message]="'settings.llm.features.noCli.message' | t"
          [dismissLabel]="'common.dismiss' | t"
          data-testid="settings-llm-features-no-cli"
        >
          <button
            dsBtn
            size="sm"
            type="button"
            data-testid="settings-llm-features-no-cli-open"
            (click)="openProviders()"
          >
            <ds-icon name="arrow-up" size="sm" />{{ 'settings.llm.features.openProviders' | t }}
          </button>
        </ds-banner>
      }
      <div class="settings-group">
        <ng-container *ngTemplateOutlet="row; context: { $implicit: defaultSlot() }" />
      </div>
      <div class="settings-group">
        <h4>{{ 'settings.llm.features.perFeature' | t }}</h4>
        @for (slot of featureSlots(); track slot.key) {
          <ng-container *ngTemplateOutlet="row; context: { $implicit: slot }" />
        }
      </div>
    </section>

    <ng-template #row let-slot>
      <div
        class="settings-row llm-features-row"
        [id]="'settings-llm-feature-' + slot.key"
        [attr.data-state]="slot.problem ? 'warning' : null"
        [attr.data-testid]="'settings-llm-feature-' + slot.key"
      >
        <div class="settings-row-text">
          <label class="settings-row-label" [for]="'settings-llm-feature-' + slot.key + '-cli'">
            {{ prefix + 'slot.' + slot.key | t }}
          </label>
          <span class="settings-row-hint" [id]="'settings-llm-feature-' + slot.key + '-hint'">
            {{ prefix + 'slot.' + slot.key + 'Hint' | t }}
          </span>
          @if (slot.key !== 'default' && !slot.choice) {
            <span class="settings-row-hint" [attr.data-testid]="'settings-llm-feature-' + slot.key + '-inherited'">
              @if (slot.inherited; as llm) {
                {{ 'settings.llm.features.usesDefault' | t: { llm: describe(llm) } }}
              } @else {
                {{ 'settings.llm.features.noDefaultYet' | t }}
              }
            </span>
          }
          @if (slot.problem; as problem) {
            <span
              class="llm-features-warning"
              [id]="'settings-llm-feature-' + slot.key + '-warning'"
              [attr.data-testid]="'settings-llm-feature-' + slot.key + '-warning'"
            >
              <ds-icon name="alert-triangle" size="sm" />
              <span>
                {{ prefix + 'problem.' + problem.key | t: { cli: problem.cli } }}
                @if (problem.showLink) {
                  <button
                    type="button"
                    class="llm-features-link"
                    [attr.data-testid]="'settings-llm-feature-' + slot.key + '-open-providers'"
                    (click)="openProviders()"
                  >
                    {{ 'settings.llm.features.openProviders' | t }}
                  </button>
                }
              </span>
            </span>
          }
        </div>
        <div class="settings-row-control llm-features-control">
          <span class="ds-select llm-features-cli">
            <select
              class="ds-input"
              [id]="'settings-llm-feature-' + slot.key + '-cli'"
              [disabled]="slot.selectDisabled"
              [attr.aria-describedby]="describedBy(slot)"
              [attr.data-testid]="'settings-llm-feature-' + slot.key + '-cli'"
              (change)="setCli(slot, $event)"
            >
              @for (option of slot.options; track option.value) {
                <option
                  [value]="option.value"
                  [disabled]="option.disabled"
                  [selected]="option.value === (slot.choice?.cli ?? '')"
                >
                  {{ option.label }}
                </option>
              }
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
          <input
            class="ds-input mono llm-features-model"
            autocomplete="off"
            spellcheck="false"
            [attr.list]="slot.choice ? 'settings-llm-feature-' + slot.key + '-models' : null"
            [disabled]="!slot.choice"
            [value]="(slot.choice ?? slot.inherited)?.model ?? ''"
            [placeholder]="'settings.llm.features.cliDefault' | t"
            [attr.aria-label]="'settings.llm.features.modelLabel' | t: { name: prefix + 'slot.' + slot.key | t }"
            [attr.data-testid]="'settings-llm-feature-' + slot.key + '-model'"
            (change)="setModel(slot, $event)"
          />
          <datalist [id]="'settings-llm-feature-' + slot.key + '-models'">
            @for (model of slot.suggestions; track model) {
              <option [value]="model"></option>
            }
          </datalist>
        </div>
      </div>
    </ng-template>
  `,
})
class LlmFeaturesPreviewComponent {
  protected readonly state = inject(LlmStoryStore).state;
  protected readonly prefix = PREFIX;

  private readonly i18n: I18nService = inject(I18nService);

  protected readonly noCliInstalled = computed<boolean>(() =>
    this.state().clis.every((cli: LlmCliStatus): boolean => cli.state !== 'installed'),
  );

  protected readonly defaultSlot = computed<LlmSlot>(() =>
    this.slot(this.state(), 'default', this.state().defaultChoice),
  );

  protected readonly featureSlots = computed<LlmSlot[]>(() => {
    const state: LlmStoryState = this.state();
    return LLM_FEATURE_IDS.map((feature: LlmFeatureId): LlmSlot => {
      const choice: LlmChoice | null = state.features.find((item) => item.feature === feature)?.choice ?? null;
      return this.slot(state, feature, choice);
    });
  });

  protected describe(choice: LlmChoice): string {
    const model: string = choice.model ?? this.i18n.t(`${PREFIX}cliDefault`);
    return `${this.cliName(choice.cli)} · ${model}`;
  }

  protected describedBy(slot: LlmSlot): string {
    const base = `settings-llm-feature-${slot.key}-hint`;
    return slot.problem ? `${base} settings-llm-feature-${slot.key}-warning` : base;
  }

  protected setCli(slot: LlmSlot, event: Event): void {
    const value: string = (event.target as HTMLSelectElement).value;
    this.write(slot.key, value ? { cli: value as LlmCliId, model: null } : null);
  }

  protected setModel(slot: LlmSlot, event: Event): void {
    if (!slot.choice) return;
    const model: string = (event.target as HTMLInputElement).value.trim();
    this.write(slot.key, { ...slot.choice, model: model || null });
  }

  protected reset(): void {
    this.state.update((state: LlmStoryState): LlmStoryState => ({
      ...state,
      features: LLM_FEATURE_IDS.map((feature: LlmFeatureId) => ({ feature, choice: null })),
    }));
  }

  protected openProviders(): void {
    const target: HTMLElement | null = document.querySelector(PROVIDERS_SELECTOR);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private write(key: SlotKey, choice: LlmChoice | null): void {
    this.state.update((state: LlmStoryState): LlmStoryState => {
      if (key === 'default') return { ...state, defaultChoice: choice };
      return { ...state, features: state.features.map((item) => (item.feature === key ? { ...item, choice } : item)) };
    });
  }

  private slot(state: LlmStoryState, key: SlotKey, choice: LlmChoice | null): LlmSlot {
    const isDefault: boolean = key === 'default';
    const options: CliOption[] = this.options(state, isDefault, choice);
    const current: string = choice?.cli ?? '';
    return {
      key,
      choice,
      inherited: isDefault ? null : state.defaultChoice,
      options,
      selectDisabled: !options.some((option: CliOption): boolean => !option.disabled && option.value !== current),
      suggestions: choice ? LLM_MODEL_SUGGESTIONS[choice.cli] : [],
      problem: this.problem(state, isDefault, choice),
    };
  }

  private options(state: LlmStoryState, isDefault: boolean, choice: LlmChoice | null): CliOption[] {
    const installed: boolean = !this.noCliInstalled();
    const first: CliOption = isDefault
      ? { value: '', label: this.text(installed ? 'chooseCli' : 'noCliOption'), disabled: true }
      : { value: '', label: this.text('useDefault'), disabled: false };
    const clis: CliOption[] = state.clis
      .filter((cli: LlmCliStatus): boolean => cli.state === 'installed' || cli.id === choice?.cli)
      .map((cli: LlmCliStatus): CliOption => {
        const available: boolean = cli.state === 'installed';
        const label: string = available ? cli.name : this.text(`unavailableOption.${cli.state}`, { cli: cli.name });
        return { value: cli.id, label, disabled: !available };
      });
    return [first, ...clis];
  }

  private problem(state: LlmStoryState, isDefault: boolean, choice: LlmChoice | null): LlmProblem | null {
    if (choice) {
      const cli: LlmCliStatus | undefined = state.clis.find((item: LlmCliStatus): boolean => item.id === choice.cli);
      if (!cli || cli.state === 'installed') return null;
      return { key: cli.state, cli: cli.name, showLink: true };
    }
    if (isDefault) {
      return this.noCliInstalled() ? null : { key: 'noDefault', cli: '', showLink: false };
    }
    const fallback: LlmChoice | null = state.defaultChoice;
    if (!fallback || !this.problem(state, true, fallback)) return null;
    return { key: 'defaultUnavailable', cli: this.cliName(fallback.cli), showLink: false };
  }

  private cliName(id: LlmCliId): string {
    return this.state().clis.find((cli: LlmCliStatus): boolean => cli.id === id)?.name ?? id;
  }

  private text(key: string, params?: Record<string, string>): string {
    return this.i18n.t(`${PREFIX}${key}`, params);
  }
}

@Component({
  selector: 'ds-settings-llm-story-host',
  imports: [IconComponent, LlmFeaturesPreviewComponent, LlmProvidersPreviewComponent, TranslatePipe],
  providers: [LlmStoryStore],
  template: `
    <div class="ds-page settings-page" style="height: 100vh">
      <div class="ds-page-toolbar">
        <h1>{{ 'nav.settings' | t }}</h1>
      </div>
      <div class="settings-layout">
        <nav class="settings-nav">
          <span class="settings-nav-item"
            ><ds-icon name="sliders" /><span class="label">{{ 'settings.page.nav.general' | t }}</span></span
          >
          <span class="settings-nav-item"
            ><ds-icon name="shield" /><span class="label">{{ 'settings.page.nav.diagnostics' | t }}</span></span
          >
          <span class="settings-nav-item" aria-current="page"
            ><ds-icon name="sparkles" /><span class="label">{{ 'settings.page.nav.llm' | t }}</span></span
          >
        </nav>
        <div class="settings-main">
          <div class="settings-content" data-testid="settings-llm-pane">
            <ds-llm-providers-preview />
            <ds-llm-features-preview />
          </div>
        </div>
      </div>
    </div>
  `,
})
class SettingsLlmStoryHostComponent implements OnInit {
  readonly initial = input<LlmStoryState>(LLM_STATE_MIXED);

  private readonly store: LlmStoryStore = inject(LlmStoryStore);

  ngOnInit(): void {
    this.store.state.set(this.initial());
  }
}

const meta: Meta<{ initial: LlmStoryState }> = {
  title: 'Pages/Settings/LLM',
  parameters: { layout: 'fullscreen' },
  args: { initial: LLM_STATE_MIXED },
  decorators: [moduleMetadata({ imports: [SettingsLlmStoryHostComponent] })],
  render: (args) => ({
    props: args,
    template: '<ds-settings-llm-story-host [initial]="initial" />',
  }),
};

export default meta;

type Story = StoryObj<{ initial: LlmStoryState }>;

export const Main: Story = {};

export const NoCliInstalled: Story = {
  args: { initial: LLM_STATE_NONE },
};
