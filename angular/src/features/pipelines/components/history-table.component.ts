import { Component, computed, inject, input } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { formatDateTime, formatDuration, formatShortDateTime } from '../../../core/format';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PipelineActions } from '../pipeline-actions';
import { PipelinesViewStore } from '../pipelines-view.store';
import { RunStatusComponent } from './run-status.component';
import { runName, runResult, runSeconds } from '../run-status';

interface HistoryRow {
  run: PipelineRun;
  name: string;
  result: string;
  finished: string;
  finishedTitle: string;
  duration: string;
}

const SKELETON_ROWS: number[] = [1, 2, 3, 4];
const SKELETON_CELLS: number[] = [1, 2, 3, 4, 5];

@Component({
  selector: 'ds-history-table',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    CheckboxComponent,
    RunStatusComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './history-table.component.html',
})
export class HistoryTableComponent {
  readonly selectedId = input<string | null>(null);

  private readonly i18n: I18nService = inject(I18nService);

  protected readonly actions: PipelineActions = inject(PipelineActions);
  protected readonly store: PipelinesViewStore = inject(PipelinesViewStore);
  protected readonly skeletonRows: number[] = SKELETON_ROWS;
  protected readonly skeletonCells: number[] = SKELETON_CELLS;
  protected readonly rows = computed<HistoryRow[]>(() =>
    this.store.history().runs.map((run) => ({
      run,
      name: runName(run, this.i18n),
      result: runResult(run, this.i18n),
      finished: run.finishedAt ? formatShortDateTime(run.finishedAt, this.i18n.language()) : '—',
      finishedTitle: run.finishedAt ? formatDateTime(run.finishedAt, this.i18n.language()) : '',
      duration: formatDuration(runSeconds(run)),
    })),
  );
  protected readonly allChecked = computed<boolean>(
    () => this.rows().length > 0 && this.rows().every((row) => this.store.checked().has(row.run.id)),
  );
}
