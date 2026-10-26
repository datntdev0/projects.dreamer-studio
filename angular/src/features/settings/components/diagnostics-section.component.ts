import { Component, computed, inject, signal, type OnInit, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { AreaStateComponent } from '@components/state/area-state.component';
import { DotComponent, type DotKind } from '@components/status/dot.component';
import { PillComponent } from '@components/status/pill.component';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { CHECK_CATEGORIES } from '@dreamer/shared/models/diagnostics';
import type { CheckCategory, CheckResult, CheckStatus, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { DesktopApi } from '@core/desktop-api';
import { formatBytes, formatShortDateTime, formatTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';

interface CheckView {
  id: string;
  status: CheckStatus;
  statusLabel: string;
  name: string;
  message: string;
  fix: string | null;
}

interface GroupView {
  category: CheckCategory;
  label: string;
  checks: CheckView[];
}

const CATEGORY_KEYS: Record<CheckCategory, string> = {
  storage: 'diagnostics.category.storage',
  database: 'diagnostics.category.database',
  backend: 'diagnostics.category.backend',
  llm: 'diagnostics.category.llm',
  settings: 'diagnostics.category.settings',
};

const STATUS_KEYS: Record<CheckStatus, string> = {
  ok: 'diagnostics.status.ok',
  warning: 'diagnostics.status.warning',
  error: 'diagnostics.status.error',
};

const DOT_KINDS: Record<CheckStatus, DotKind> = { ok: 'success', warning: 'warning', error: 'danger' };

@Component({
  selector: 'ds-settings-diagnostics',
  imports: [AreaStateComponent, ButtonDirective, DotComponent, PillComponent, TranslatePipe],
  templateUrl: './diagnostics-section.component.html',
})
export class DiagnosticsSectionComponent implements OnInit {
  private readonly api: DesktopApi = inject(DesktopApi);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly dotKinds: Record<CheckStatus, DotKind> = DOT_KINDS;
  protected readonly lastRun = signal<DiagnosticsRun | null>(null);
  protected readonly running = signal<boolean>(false);
  protected readonly engineError = signal<boolean>(false);

  protected readonly groups: Signal<GroupView[]> = computed(() => {
    const results: CheckResult[] = this.lastRun()?.results ?? [];
    return CHECK_CATEGORIES.map((category) => ({
      category,
      label: this.i18n.t(CATEGORY_KEYS[category]),
      checks: results.filter((result) => result.category === category).map((result) => this.toView(result)),
    })).filter((group) => group.checks.length > 0);
  });
  protected readonly lastRunText: Signal<string> = computed(() => {
    const run: DiagnosticsRun | null = this.lastRun();
    if (!run) return this.i18n.t('diagnostics.neverRun');
    const language = this.i18n.language();
    const isToday: boolean = new Date(run.ranAt).toDateString() === new Date().toDateString();
    const time: string = isToday ? formatTime(run.ranAt, language) : formatShortDateTime(run.ranAt, language);
    return this.i18n.t('diagnostics.lastRun', { time });
  });

  ngOnInit(): void {
    void this.run();
  }

  protected async run(): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    this.engineError.set(false);
    try {
      this.lastRun.set((await this.api.runDiagnostics()) ?? this.lastRun());
    } catch (error) {
      this.engineError.set(true);
      this.api.writeLog({ level: 'error', module: 'settings', message: errorMessage(error) });
    } finally {
      this.running.set(false);
    }
  }

  private toView(result: CheckResult): CheckView {
    const params: TranslateParams = { ...result.params };
    if (typeof params['free'] === 'number') params['free'] = formatBytes(params['free'], this.i18n.language());
    return {
      id: result.id,
      status: result.status,
      statusLabel: this.i18n.t(STATUS_KEYS[result.status]),
      name: this.i18n.t(result.nameKey),
      message: this.i18n.t(result.messageKey, params),
      fix: result.fixKey ? this.i18n.t(result.fixKey, params) : null,
    };
  }
}
