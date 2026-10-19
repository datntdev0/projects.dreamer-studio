import { Component, Signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { AppInfoStore } from '../../core/app-info';
import { BackendStatus } from '../../core/backend-status';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ACTIVE_PIPELINES, type PipelineRunView, type PipelineSlot, formatRunStep } from '../../core/slots';
import { ThemeService, type Theme } from '../../core/theme/theme.service';

const THEME_KEYS: Record<Theme, string> = { light: 'status.theme.light', dark: 'status.theme.dark' };

@Component({
  selector: 'footer[dsStatusBar]',
  imports: [IconComponent, DotComponent, TranslatePipe],
  templateUrl: './status-bar.component.html',
  host: { class: 'ds-app-status', 'data-testid': 'statusbar' },
})
export class StatusBarComponent {
  private readonly router: Router = inject(Router);
  private readonly appInfo: AppInfoStore = inject(AppInfoStore);
  private readonly pipelines: Signal<PipelineSlot> = inject(ACTIVE_PIPELINES);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly theme: Signal<Theme> = inject(ThemeService).theme;
  protected readonly backend: Signal<BackendState> = inject(BackendStatus).state;

  protected readonly dataDir = computed<string>(() => this.appInfo.info()?.appDataDir ?? '');
  protected readonly running = computed<PipelineRunView[]>(() =>
    this.pipelines().runs.filter((run) => run.status === 'running'),
  );
  protected readonly queued = computed<number>(
    () => this.pipelines().runs.filter((run) => run.status === 'queued').length,
  );
  protected readonly pipelineText = computed<string>(() => {
    const run = this.running()[0];
    if (!run) return this.i18n.t('status.pipeline.idle');
    const text = `${run.name} · ${formatRunStep(run, this.i18n)}`;
    return this.queued() > 0 ? `${text} · ${this.i18n.t('status.pipeline.queued', { count: this.queued() })}` : text;
  });
  protected readonly langTheme = computed<string>(
    () => `${this.i18n.language().toUpperCase()} · ${this.i18n.t(THEME_KEYS[this.theme()])}`,
  );

  protected openPipelines(): void {
    void this.router.navigateByUrl('/pipelines');
  }
}
