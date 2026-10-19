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
  running: { label: 'Ready', pill: 'success', dot: 'success' },
  starting: { label: 'Starting', pill: 'info', dot: 'primary' },
  unavailable: { label: 'Failed', pill: 'warning', dot: 'warning' },
};

const STATUS_VIEWS: Record<PipelineRunStatus, { label: string; pill: PillKind }> = {
  queued: { label: 'Queued', pill: 'neutral' },
  running: { label: 'Running', pill: 'info' },
  succeeded: { label: 'Succeeded', pill: 'success' },
  failed: { label: 'Failed', pill: 'danger' },
  cancelled: { label: 'Cancelled', pill: 'neutral' },
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
  ],
  templateUrl: './home.page.html',
  host: { class: 'ds-page', 'data-testid': 'home-page' },
})
export class HomePage {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly toast: ToastService = inject(ToastService);
  private readonly backendStatus: BackendStatus = inject(BackendStatus);

  protected readonly appInfo: AppInfoStore = inject(AppInfoStore);
  protected readonly active: Signal<PipelineSlot> = inject(ACTIVE_PIPELINES);
  protected readonly recent: Signal<PipelineSlot> = inject(RECENT_PIPELINES);

  protected readonly backendState: Signal<BackendState> = this.backendStatus.state;
  protected readonly backend: Signal<BackendView> = computed(() => BACKEND_VIEWS[this.backendStatus.state()]);
  protected readonly running: Signal<RunningRow[]> = computed(() =>
    this.active()
      .runs.filter((run) => run.status === 'running' || run.status === 'queued')
      .map((run) => ({ run, text: run.status === 'running' ? formatRunStep(run) : 'Queued' })),
  );
  protected readonly rows: Signal<RunRow[]> = computed(() =>
    this.recent()
      .runs.slice(0, RECENT_LIMIT)
      .map((run) => ({
        run,
        stepText: formatRunStep(run),
        duration: run.status === 'queued' ? '—' : formatDuration(run.seconds),
        when: formatRelative(run.startedAt),
        started: formatDateTime(run.startedAt),
        pill: STATUS_VIEWS[run.status].pill,
        label: STATUS_VIEWS[run.status].label,
      })),
  );

  protected async openDataDir(path: string): Promise<void> {
    try {
      await this.desktopApi.openDataDir();
    } catch {
      this.toast.show({ kind: 'danger', title: 'Cannot open the app data folder', message: path });
    }
  }
}
