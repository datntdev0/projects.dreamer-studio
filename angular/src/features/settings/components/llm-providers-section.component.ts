import { Component, computed, inject, OnInit, signal, type Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent, type PillKind } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LlmStore } from '@core/stores/llm-store';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import { LLM_CLI_IDS, LLM_CLIS, LLM_TEST_TIMEOUT_MS } from '@dreamer/shared/models/llm';
import type { LlmCliId, LlmCliInfo, LlmCliState, LlmCliStatus, LlmTestResult } from '@dreamer/shared/models/llm';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';

interface StatePill {
  kind: PillKind;
  icon: string;
  label: string;
}

interface CliProblem {
  code: string;
  failedAfter: string | null;
  params: TranslateParams;
}

interface CliRow {
  cli: LlmCliStatus;
  pill: StatePill;
  testState: 'idle' | 'running' | 'ok' | 'error';
  testedIn: string | null;
  problem: CliProblem | null;
}

type PathError = 'required' | 'invalid';

const STATE_PILLS: Record<LlmCliState, StatePill> = {
  installed: { kind: 'success', icon: 'check', label: 'settings.llm.providers.state.installed' },
  notInstalled: { kind: 'neutral', icon: 'minus', label: 'settings.llm.providers.state.notInstalled' },
  invalidPath: { kind: 'danger', icon: 'alert-circle', label: 'settings.llm.providers.state.invalidPath' },
};
const DETECTING_PILL: StatePill = { kind: 'info', icon: 'retry', label: 'settings.llm.providers.detecting' };

@Component({
  selector: 'ds-settings-llm-providers',
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
  templateUrl: './llm-providers-section.component.html',
})
export class LlmProvidersSectionComponent implements OnInit {
  protected readonly store: LlmStore = inject(LlmStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly cloudProviders: string[] = ['OpenAI', 'Anthropic', 'Google'];
  protected readonly dialogCli = signal<LlmCliStatus | null>(null);
  protected readonly pathDraft = signal<string>('');
  protected readonly pathError = signal<PathError | null>(null);
  protected readonly checkingPath = signal<boolean>(false);

  protected readonly noneInstalled: Signal<boolean> = computed(() => {
    const statuses: LlmCliStatus[] | null = this.store.statuses();
    return statuses !== null && !this.store.detecting() && statuses.every((cli) => cli.state !== 'installed');
  });

  protected readonly rows: Signal<CliRow[]> = computed(() =>
    LLM_CLI_IDS.map((id: LlmCliId): CliRow => {
      const cli: LlmCliStatus = this.store.statuses()?.find((item) => item.id === id) ?? {
        id,
        state: 'notInstalled',
        version: null,
        path: null,
        customPath: false,
      };
      const test = this.store.tests()[id];
      const result: LlmTestResult | null = test?.result ?? null;
      return {
        cli,
        pill: this.store.detecting() ? DETECTING_PILL : STATE_PILLS[cli.state],
        testState: test?.running ? 'running' : result?.ok ? 'ok' : result ? 'error' : 'idle',
        testedIn: result?.ok ? this.seconds(result.durationMs) : null,
        problem: this.problemOf(cli, result),
      };
    }),
  );

  protected readonly pathErrorText: Signal<string> = computed(() => {
    const cli: LlmCliStatus | null = this.dialogCli();
    if (!cli || !this.pathError()) return '';
    if (this.pathError() === 'required') return this.i18n.t('settings.llm.providers.dialog.required');
    const params: TranslateParams = this.paramsOf(cli);
    return `${this.i18n.t('errors.LLM_PATH_INVALID.message', params)} ${this.i18n.t('errors.LLM_PATH_INVALID.fix', params)}`;
  });

  ngOnInit(): void {
    void this.store.load();
  }

  protected info(id: LlmCliId): LlmCliInfo {
    return LLM_CLIS[id];
  }

  protected detect(): void {
    void this.store.detect();
  }

  protected test(id: LlmCliId): void {
    void this.store.test(id);
  }

  protected clearPath(id: LlmCliId): void {
    void this.store.setPath(id, null).catch((): void => undefined);
  }

  protected openPathDialog(cli: LlmCliStatus): void {
    this.pathDraft.set(cli.customPath ? (cli.path ?? '') : '');
    this.pathError.set(null);
    this.dialogCli.set(cli);
  }

  protected closePathDialog(): void {
    if (this.checkingPath()) return;
    this.dialogCli.set(null);
    this.pathError.set(null);
  }

  protected onPathInput(event: Event): void {
    this.pathDraft.set((event.target as HTMLInputElement).value);
    this.pathError.set(null);
  }

  protected async browse(id: LlmCliId): Promise<void> {
    const path: string | null = await this.store.pickPath(id);
    if (path && this.dialogCli()?.id === id) {
      this.pathDraft.set(path);
      this.pathError.set(null);
    }
  }

  protected async savePath(cli: LlmCliStatus): Promise<void> {
    if (this.checkingPath()) return;
    const path: string = this.pathDraft().trim();
    if (!path) {
      this.pathError.set('required');
      return;
    }
    this.checkingPath.set(true);
    try {
      const status: LlmCliStatus | null = await this.store.setPath(cli.id, path);
      this.checkingPath.set(false);
      if (status) this.closePathDialog();
    } catch (error) {
      this.checkingPath.set(false);
      if (isAppError(error) && error.code === ErrorCode.LlmPathInvalid) this.pathError.set('invalid');
    }
  }

  private problemOf(cli: LlmCliStatus, result: LlmTestResult | null): CliProblem | null {
    if (cli.state === 'invalidPath') {
      return { code: ErrorCode.LlmPathInvalid, failedAfter: null, params: this.paramsOf(cli) };
    }
    if (result && !result.ok && result.error) {
      return {
        code: result.error.code,
        failedAfter: this.seconds(result.durationMs),
        params: this.paramsOf(cli, result.error.details),
      };
    }
    return null;
  }

  private paramsOf(cli: LlmCliStatus, details?: string): TranslateParams {
    const info: LlmCliInfo = this.info(cli.id);
    return {
      name: info.name,
      signIn: info.signIn,
      command: info.executable,
      example: info.example,
      seconds: LLM_TEST_TIMEOUT_MS / 1000,
      code: details ?? 1,
    };
  }

  private seconds(durationMs: number): string {
    const format = new Intl.NumberFormat(this.i18n.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return format.format(durationMs / 1000);
  }
}
