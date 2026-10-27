import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ProgressComponent } from '@components/status/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { DEFAULT_PIPELINE_SETTINGS } from '@dreamer/shared/models/settings';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { formatDuration, shortId } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { PipelineSlot } from '@core/slots';
import { PipelineActions } from '../pipeline-actions';
import { RunStatusComponent } from './run-status.component';
import { runName, runSeconds, runStepName } from '../run-status';

interface QueueRow {
  run: PipelineRun;
  name: string;
  step: string;
  elapsed: string;
}

const TICK_MS = 1000;
const SKELETON_ROWS: number[] = [1, 2];
const SKELETON_CELLS: number[] = [1, 2, 3, 4];

@Component({
  selector: 'ds-queue-table',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    ProgressComponent,
    RunStatusComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './queue-table.component.html',
})
export class QueueTableComponent {
  readonly slot = input.required<PipelineSlot>();
  readonly selectedId = input<string | null>(null);

  private readonly i18n: I18nService = inject(I18nService);
  private readonly settings: SettingsStore = inject(SettingsStore);
  private readonly now = signal<number>(Date.now());

  protected readonly actions: PipelineActions = inject(PipelineActions);
  protected readonly store: PipelineStore = inject(PipelineStore);
  protected readonly skeletonRows: number[] = SKELETON_ROWS;
  protected readonly skeletonCells: number[] = SKELETON_CELLS;
  protected readonly rows = computed<QueueRow[]>(() =>
    this.slot().runs.map((run, index, runs) => ({
      run,
      name: runName(run, this.i18n),
      step: this.stepText(run, runs[index - 1]),
      elapsed: run.status === 'queued' ? '—' : formatDuration(runSeconds(run, this.now())),
    })),
  );
  protected readonly runningCount = computed<number>(
    () => this.slot().runs.filter((run) => run.status === 'running').length,
  );
  protected readonly queuedCount = computed<number>(() => this.slot().runs.length - this.runningCount());

  protected readonly maxConcurrent = computed<number>(
    () => this.settings.settings()?.pipelines.maxConcurrent ?? DEFAULT_PIPELINE_SETTINGS.maxConcurrent,
  );

  constructor() {
    const timer: ReturnType<typeof setInterval> = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private stepText(run: PipelineRun, ahead: PipelineRun | undefined): string {
    if (run.status === 'running') {
      return this.i18n.t('pipelines.row.step', {
        step: run.stepIndex,
        steps: run.stepCount,
        name: runStepName(run, this.i18n),
      });
    }
    return ahead ? this.i18n.t('pipelines.row.queued', { name: `#${shortId(ahead.id)}` }) : '';
  }
}
