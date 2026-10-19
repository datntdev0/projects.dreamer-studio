import { Component, Signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { AppInfoStore } from '../../core/app-info';
import { BackendStatus } from '../../core/backend-status';
import { I18nService, type Language } from '../../core/i18n/i18n.service';
import { ACTIVE_PIPELINES, type PipelineRunView, type PipelineSlot, formatRunStep } from '../../core/slots';
import { ThemeService, type Theme } from '../../core/theme/theme.service';

@Component({
  selector: 'footer[dsStatusBar]',
  imports: [IconComponent, DotComponent],
  templateUrl: './status-bar.component.html',
  host: { class: 'ds-app-status', 'data-testid': 'statusbar' },
})
export class StatusBarComponent {
  private readonly router: Router = inject(Router);
  private readonly appInfo: AppInfoStore = inject(AppInfoStore);
  private readonly pipelines: Signal<PipelineSlot> = inject(ACTIVE_PIPELINES);
  private readonly language: Signal<Language> = inject(I18nService).language;
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
    if (!run) return 'No running pipelines';
    const text = `${run.name} · ${formatRunStep(run)}`;
    return this.queued() > 0 ? `${text} · ${this.queued()} queued` : text;
  });
  protected readonly langTheme = computed<string>(() => `${this.language().toUpperCase()} · ${this.theme()}`);

  protected openPipelines(): void {
    void this.router.navigateByUrl('/pipelines');
  }
}
