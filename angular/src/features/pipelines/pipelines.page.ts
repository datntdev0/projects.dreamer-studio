import { Component, computed, inject, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { SplitterDirective } from '@components/splitter/splitter.directive';
import { TabsComponent, type TabItem } from '@components/tabs/tabs.component';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { map } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PipelineStore } from '../../core/pipeline-store';
import { PageTitleDirective } from '../../shell/page-title.directive';
import { PipelineActions } from './pipeline-actions';
import { QueueTableComponent } from './queue-table.component';
import { RunDetailsComponent } from './run-details.component';
import { RunLogComponent } from './run-log.component';
import { StartPipelineDialogComponent } from './start-pipeline-dialog.component';

const QUEUE_TAB = 'queue';

@Component({
  selector: 'ds-pipelines-page',
  imports: [
    ButtonDirective,
    IconComponent,
    PageTitleDirective,
    QueueTableComponent,
    RunDetailsComponent,
    RunLogComponent,
    SplitterDirective,
    StartPipelineDialogComponent,
    TabsComponent,
    TranslatePipe,
  ],
  templateUrl: './pipelines.page.html',
  host: { class: 'ds-page', 'data-testid': 'pipelines-page' },
})
export class PipelinesPage {
  private readonly i18n: I18nService = inject(I18nService);
  private readonly actions: PipelineActions = inject(PipelineActions);
  private readonly routeId: Signal<string | null> = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null },
  );

  protected readonly store: PipelineStore = inject(PipelineStore);
  protected readonly startOpen = signal<boolean>(false);
  protected readonly tabs = computed<TabItem[]>(() => {
    const count: number = this.store.active().runs.length;
    return [{ id: QUEUE_TAB, label: this.i18n.t('pipelines.view.queue'), count: count > 0 ? count : null }];
  });
  protected readonly selectedId = computed<string | null>(
    () => this.routeId() ?? this.store.active().runs.find((run) => run.status === 'running')?.id ?? null,
  );

  protected onStarted(run: PipelineRun): void {
    this.startOpen.set(false);
    this.actions.open(run.id);
  }
}
