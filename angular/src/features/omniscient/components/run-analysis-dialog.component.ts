import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { AnalysisPlan, AnalysisRunOptions, EntityType } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

type RunMode = AnalysisRunOptions['mode'];

const DEFAULT_BATCH_SIZE = 5;

const BLOCKED_REASON_KEYS: Record<string, string> = {
  NOVEL_LOCKED: 'errors.NOVEL_LOCKED.message',
  ONTOLOGY_INVALID: 'analysis.pipeline.reasonInvalidOntology',
  LLM_UNAVAILABLE: 'analysis.pipeline.reasonNoLlm',
  ANALYSIS_NOTHING_TO_RUN: 'analysis.pipeline.reasonNothingToRun',
};

@Component({
  selector: 'ds-run-analysis-dialog',
  imports: [ButtonDirective, DialogComponent, IconComponent, TranslatePipe],
  templateUrl: './run-analysis-dialog.component.html',
})
export class RunAnalysisDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);

  protected readonly modes: { mode: RunMode; title: string; hint: string }[] = [
    { mode: 'missing', title: 'analysis.pipeline.missingChapters', hint: 'analysis.run.missingHint' },
    { mode: 'range', title: 'analysis.pipeline.chapterRange', hint: 'analysis.run.rangeHint' },
    { mode: 'full', title: 'analysis.run.all', hint: 'analysis.run.allHint' },
  ];
  protected readonly entityTypes = ENTITY_TYPES;
  protected readonly entityTypeKeys = entityTypeKeys;
  protected readonly batchSizes = [1, 3, 5, 10];

  protected readonly open = computed(() => this.store.dialog()?.kind === 'run');
  protected readonly total = computed(() => this.store.summary().total);
  protected readonly mode = signal<RunMode>('missing');
  protected readonly from = signal(1);
  protected readonly to = signal(1);
  protected readonly stage = signal<EntityType | 'all'>('all');
  protected readonly batchSize = signal(DEFAULT_BATCH_SIZE);
  protected readonly overwrite = signal(false);
  protected readonly plan = signal<AnalysisPlan | null>(null);
  protected readonly planning = signal(false);
  protected readonly startError = signal('');

  protected readonly options = computed<AnalysisRunOptions>(() => {
    const range = this.mode() === 'range';
    return {
      mode: this.mode(),
      from: range ? this.from() : null,
      to: range ? this.to() : null,
      overwrite: this.mode() !== 'missing' && this.overwrite(),
      stage: this.stage(),
      batchSize: this.batchSize(),
    };
  });
  protected readonly invalidRange = computed(() => {
    const [from, to] = [this.from(), this.to()];
    const valid = Number.isInteger(from) && Number.isInteger(to) && 1 <= from && from <= to && to <= this.total();
    return this.mode() === 'range' && !valid;
  });
  protected readonly reason = computed(() => {
    if (this.startError()) return this.startError();
    if (this.invalidRange()) return this.i18n.t('analysis.pipeline.reasonInvalidRange');
    if (this.store.run() || this.store.novel()?.lock) return this.i18n.t('errors.NOVEL_LOCKED.message');
    const blocked = this.plan()?.blockedReason;
    if (!blocked) return '';
    return BLOCKED_REASON_KEYS[blocked] ? this.i18n.t(BLOCKED_REASON_KEYS[blocked]) : blocked;
  });
  protected readonly canStart = computed(
    () => !!this.plan() && !this.planning() && !this.reason() && this.store.canRun(),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.reset());
    });
    effect((onCleanup) => {
      if (!this.open()) return;
      const options = this.options();
      const invalid = this.invalidRange();
      untracked(() => {
        this.planning.set(!invalid);
        if (invalid) this.plan.set(null);
      });
      if (invalid) return;
      let active = true;
      void this.store
        .plan(options)
        .then((plan) => {
          if (active) this.plan.set(plan);
        })
        .catch(() => {
          if (active) this.plan.set(null);
        })
        .finally(() => {
          if (active) this.planning.set(false);
        });
      onCleanup(() => {
        active = false;
      });
    });
  }

  protected setMode(mode: RunMode): void {
    this.mode.set(mode);
    this.startError.set('');
  }

  protected setNumber(target: 'from' | 'to', event: Event): void {
    this[target].set(Number((event.target as HTMLInputElement).value));
    this.startError.set('');
  }

  protected setStage(event: Event): void {
    this.stage.set((event.target as HTMLSelectElement).value as EntityType | 'all');
  }

  protected setBatchSize(event: Event): void {
    this.batchSize.set(Number((event.target as HTMLSelectElement).value));
  }

  protected setOverwrite(event: Event): void {
    this.overwrite.set((event.target as HTMLInputElement).checked);
  }

  protected close(): void {
    if (this.open()) this.store.dialog.set(null);
  }

  protected async start(): Promise<void> {
    if (!this.canStart()) return;
    if (await this.store.start(this.options())) this.store.dialog.set(null);
    else this.startError.set(this.store.error());
  }

  private reset(): void {
    this.mode.set('missing');
    this.from.set(1);
    this.to.set(Math.max(1, this.total()));
    this.stage.set('all');
    this.batchSize.set(DEFAULT_BATCH_SIZE);
    this.overwrite.set(false);
    this.plan.set(null);
    this.startError.set('');
  }
}
