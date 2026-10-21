import { Component, computed, effect, inject, signal, untracked, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { SplitterDirective } from '@components/splitter/splitter.directive';
import { TabsComponent, type TabItem } from '@components/tabs/tabs.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { PipelineRun, PipelineType } from '@dreamer/shared/models/pipeline';
import { map } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PipelineStore } from '../../core/stores/pipeline-store';
import { PageTitleDirective } from '../../shell/page-title.directive';
import { HistoryTableComponent } from './components/history-table.component';
import { PipelineActions } from './pipeline-actions';
import { PipelinesViewStore, type HistoryStatusFilter, type PipelineView } from './pipelines-view.store';
import { QueueTableComponent } from './components/queue-table.component';
import { RunDetailsComponent } from './components/run-details.component';
import { RunLogComponent } from './components/run-log.component';
import { isActiveRun } from './run-status';
import { StartPipelineDialogComponent } from './components/start-pipeline-dialog.component';

interface OptionView {
  value: string;
  label: string;
}

const ALL = 'all';

@Component({
  selector: 'ds-pipelines-page',
  imports: [
    ButtonDirective,
    HistoryTableComponent,
    IconComponent,
    PageTitleDirective,
    QueueTableComponent,
    RunDetailsComponent,
    RunLogComponent,
    SplitterDirective,
    StartPipelineDialogComponent,
    TabsComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './pipelines.page.html',
  host: { class: 'ds-page', 'data-testid': 'pipelines-page', '[attr.data-view]': 'viewStore.view()' },
})
export class PipelinesPage {
  private readonly i18n: I18nService = inject(I18nService);
  private readonly actions: PipelineActions = inject(PipelineActions);
  private readonly routeId: Signal<string | null> = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null },
  );

  protected readonly store: PipelineStore = inject(PipelineStore);
  protected readonly viewStore: PipelinesViewStore = inject(PipelinesViewStore);
  protected readonly startOpen = signal<boolean>(false);
  protected readonly tabs = computed<TabItem[]>(() => {
    const queued: number = this.store.active().runs.length;
    const history = this.viewStore.history();
    return [
      { id: 'queue', label: this.i18n.t('pipelines.view.queue'), count: queued > 0 ? queued : null },
      {
        id: 'history',
        label: this.i18n.t('pipelines.view.history'),
        count: history.state === 'ready' ? history.total : null,
      },
    ];
  });
  protected readonly selectedId = computed<string | null>(
    () => this.routeId() ?? this.store.active().runs.find((run) => run.status === 'running')?.id ?? null,
  );
  protected readonly showFilters = computed<boolean>(() => {
    const history = this.viewStore.history();
    return (
      this.viewStore.view() === 'history' &&
      history.state === 'ready' &&
      (history.runs.length > 0 || this.viewStore.filtered())
    );
  });
  protected readonly statusOptions = computed<OptionView[]>(() => [
    { value: ALL, label: this.i18n.t('pipelines.filter.allStatuses') },
    { value: 'succeeded', label: this.i18n.t('run.succeeded') },
    { value: 'failed', label: this.i18n.t('run.failed') },
    { value: 'cancelled', label: this.i18n.t('run.cancelled') },
  ]);
  protected readonly statusValue = computed<string>(() => this.viewStore.status() ?? ALL);
  protected readonly typeValue = computed<string>(() => this.viewStore.type() ?? ALL);
  protected readonly typeOptions = computed<OptionView[]>(() => [
    { value: ALL, label: this.i18n.t('pipelines.filter.allTypes') },
    ...this.store.types().map((info) => ({ value: info.type, label: this.i18n.t(`run.type.${info.type}`) })),
  ]);

  constructor() {
    effect(() => {
      const id: string | null = this.routeId();
      if (id) untracked(() => void this.showRunTab(id));
    });
  }

  protected onStarted(run: PipelineRun): void {
    this.startOpen.set(false);
    this.actions.open(run.id);
  }

  protected onViewChange(view: string): void {
    this.viewStore.view.set(view as PipelineView);
  }

  protected onStatusChange(value: string): void {
    this.viewStore.setStatus(value === ALL ? null : (value as HistoryStatusFilter));
  }

  protected onTypeChange(value: string): void {
    this.viewStore.setType(value === ALL ? null : (value as PipelineType));
  }

  protected deleteChecked(): void {
    void this.actions.delete([...this.viewStore.checked()]);
  }

  private async showRunTab(id: string): Promise<void> {
    const run: Signal<PipelineRun | undefined> = this.store.run(id);
    if (!run()) await this.store.load(id);
    const found: PipelineRun | undefined = run();
    if (found && this.routeId() === id) this.viewStore.view.set(isActiveRun(found) ? 'queue' : 'history');
  }
}
