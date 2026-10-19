import { Component, computed, inject, type Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { CardComponent } from '@components/card/card.component';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { DotComponent, type DotKind } from '@components/status/dot.component';
import { PillComponent, type PillKind } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { AppInfoStore } from '../../core/app-info';
import { BackendStatus } from '../../core/backend-status';
import { DesktopApi } from '../../core/desktop-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  ACTIVE_PIPELINES,
  RECENT_PIPELINES,
  formatRunStep,
  type PipelineRunStatus,
  type PipelineRunView,
  type PipelineSlot,
} from '../../core/slots';
import { PageTitleDirective } from '../../shell/page-title.directive';
import { formatDateTime, formatDuration, formatRelative } from './format';

interface BackendView {
  label: string;
  pill: PillKind;
  dot: DotKind;
}

interface RunRow {
  run: PipelineRunView;
  stepText: string;
  duration: string;
  when: string;
  started: string;
  pill: PillKind;
  label: string;
}

interface RunningRow {
  run: PipelineRunView;
  text: string;
}

const RECENT_LIMIT = 5;

const BACKEND_VIEWS: Record<BackendState, BackendView> = {
  running: { label: 'home.backend.ready', pill: 'success', dot: 'success' },
  starting: { label: 'home.backend.starting', pill: 'info', dot: 'primary' },
  unavailable: { label: 'home.backend.failed', pill: 'warning', dot: 'warning' },
};

const STATUS_VIEWS: Record<PipelineRunStatus, { label: string; pill: PillKind }> = {
  queued: { label: 'run.queued', pill: 'neutral' },
  running: { label: 'run.running', pill: 'info' },
  succeeded: { label: 'run.succeeded', pill: 'success' },
  failed: { label: 'run.failed', pill: 'danger' },
  cancelled: { label: 'run.cancelled', pill: 'neutral' },
};

@Component({
  selector: 'ds-home-page',
  imports: [
    RouterLink,
    ButtonDirective,
    CardComponent,
    IconComponent,
    AreaStateComponent,
    DotComponent,
    PillComponent,
    ProgressComponent,
    TooltipDirective,
    PageTitleDirective,
    TranslatePipe,
  ],
  templateUrl: './home.page.html',
  host: { class: 'ds-page', 'data-testid': 'home-page' },
})
export class HomePage {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly toast: ToastService = inject(ToastService);
  private readonly backendStatus: BackendStatus = inject(BackendStatus);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly appInfo: AppInfoStore = inject(AppInfoStore);
  protected readonly active: Signal<PipelineSlot> = inject(ACTIVE_PIPELINES);
  protected readonly recent: Signal<PipelineSlot> = inject(RECENT_PIPELINES);

  protected readonly backendState: Signal<BackendState> = this.backendStatus.state;
  protected readonly backend: Signal<BackendView> = computed(() => BACKEND_VIEWS[this.backendStatus.state()]);
  protected readonly running: Signal<RunningRow[]> = computed(() =>
    this.active()
      .runs.filter((run) => run.status === 'running' || run.status === 'queued')
      .map((run) => ({
        run,
        text: run.status === 'running' ? formatRunStep(run, this.i18n) : this.i18n.t('run.queued'),
      })),
  );
  protected readonly rows: Signal<RunRow[]> = computed(() =>
    this.recent()
      .runs.slice(0, RECENT_LIMIT)
      .map((run) => ({
        run,
        stepText: formatRunStep(run, this.i18n),
        duration: run.status === 'queued' ? '—' : formatDuration(run.seconds),
        when: formatRelative(run.startedAt, this.i18n.language()),
        started: formatDateTime(run.startedAt, this.i18n.language()),
        pill: STATUS_VIEWS[run.status].pill,
        label: STATUS_VIEWS[run.status].label,
      })),
  );

  protected async openDataDir(path: string): Promise<void> {
    try {
      await this.desktopApi.openDataDir();
    } catch {
      this.toast.show({ kind: 'danger', title: this.i18n.t('home.openFolderFailed'), message: path });
    }
  }
}
