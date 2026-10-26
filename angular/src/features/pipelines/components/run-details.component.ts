import { Component, computed, effect, inject, input, signal, untracked, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ProgressComponent } from '@components/status/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { isAppError } from '@dreamer/shared/errors/app-error';
import type { PipelineRun, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { formatDateTime, formatDuration, shortId } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PipelineStore } from '@core/stores/pipeline-store';
import { PipelineActions } from '../pipeline-actions';
import { RunStatusComponent } from './run-status.component';
import {
  isActiveRun,
  runCancelReason,
  runError,
  runName,
  runSeconds,
  runStepDetail,
  runStepName,
  STEP_STATE_VIEWS,
  stepState,
  type StepState,
} from '../run-status';

type LoadState = 'idle' | 'notFound' | 'error';

interface StepView {
  index: number;
  key: string;
  state: StepState;
  icon: string;
  label: string;
  backend: boolean;
  detail: string;
}

const EMPTY_VALUE = '—';
const TICK_MS = 1000;

@Component({
  selector: 'ds-run-details',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    ProgressComponent,
    RunStatusComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './run-details.component.html',
  host: { class: 'pipeline-detail', 'data-testid': 'pipeline-details' },
})
export class RunDetailsComponent {
  readonly runId = input<string | null>(null);

  private readonly store: PipelineStore = inject(PipelineStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly now = signal<number>(Date.now());

  protected readonly actions: PipelineActions = inject(PipelineActions);
  protected readonly loadState = signal<LoadState>('idle');
  protected readonly run: Signal<PipelineRun | undefined> = computed(() => {
    const id: string | null = this.runId();
    return id ? this.store.run(id)() : undefined;
  });
  protected readonly active: Signal<boolean> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return !!run && isActiveRun(run);
  });
  protected readonly name: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return run ? runName(run, this.i18n) : '';
  });
  protected readonly typeName: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return run ? this.i18n.t(`run.type.${run.type}`) : '';
  });
  protected readonly stepName: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return run ? runStepName(run, this.i18n) : '';
  });
  protected readonly errorText: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return run ? runError(run, this.i18n) : '';
  });
  protected readonly cancelText: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return run ? runCancelReason(run, this.i18n) : '';
  });
  protected readonly progressText: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    if (!run) return '';
    if (run.status === 'queued') return this.i18n.t('run.waiting');
    return this.i18n.t('run.stepOf', { step: run.stepIndex, steps: run.stepCount, name: this.stepName() });
  });
  protected readonly stepViews: Signal<StepView[]> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    const info: PipelineTypeInfo | undefined = this.store.types().find((type) => type.type === run?.type);
    if (!run || !info) return [];
    return info.steps.map((step, index) => {
      const state: StepState = stepState(run, index + 1);
      const detail: string = state === 'running' ? runStepDetail(run, this.i18n) : '';
      return { index: index + 1, key: step.key, state, backend: step.backend, detail, ...STEP_STATE_VIEWS[state] };
    });
  });
  protected readonly shortId: Signal<string> = computed(() => shortId(this.run()?.id ?? ''));
  protected readonly started: Signal<string> = computed(() => this.dateTime(this.run()?.startedAt ?? null));
  protected readonly finished: Signal<string> = computed(() => this.dateTime(this.run()?.finishedAt ?? null));
  protected readonly duration: Signal<string> = computed(() => {
    const run: PipelineRun | undefined = this.run();
    return run?.startedAt ? formatDuration(runSeconds(run, this.now())) : EMPTY_VALUE;
  });

  constructor() {
    effect(() => {
      const id: string | null = this.runId();
      untracked(() => void this.ensureLoaded(id));
    });
    effect((onCleanup) => {
      if (!this.active()) return;
      const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  private dateTime(iso: string | null): string {
    return iso ? formatDateTime(iso, this.i18n.language()) : EMPTY_VALUE;
  }

  private async ensureLoaded(id: string | null): Promise<void> {
    this.loadState.set('idle');
    if (!id || this.store.run(id)()) return;
    try {
      await this.store.load(id);
      if (this.runId() === id && !this.store.run(id)()) this.loadState.set('notFound');
    } catch (error) {
      if (this.runId() !== id) return;
      this.loadState.set(isAppError(error) && error.code === 'PIPELINE_NOT_FOUND' ? 'notFound' : 'error');
    }
  }
}
