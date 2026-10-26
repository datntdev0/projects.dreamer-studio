import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { ProgressComponent } from '@components/status/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { AnalysisStep } from '@dreamer/shared/models/analysis';
import { OmniscientStore } from '../omniscient.store';

const STEP_KEYS: Record<AnalysisStep, string> = {
  preparation: 'analysis.pipeline.step.preparation',
  candidates: 'analysis.pipeline.step.candidates',
  predicates: 'analysis.pipeline.step.predicates',
  verification: 'analysis.pipeline.step.verification',
};

@Component({
  selector: 'ds-run-pill',
  imports: [
    ButtonDirective,
    DotComponent,
    IconComponent,
    ProgressComponent,
    RouterLink,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './run-pill.component.html',
  host: {
    class: 'ds-world-run-pill-wrap',
    '(document:click)': 'closeOutside($event)',
    '(keydown.escape)': 'menuOpen.set(false)',
  },
})
export class RunPillComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly stepKeys = STEP_KEYS;
  protected readonly menuOpen = signal(false);
  protected readonly chapter = computed(() => {
    const run = this.store.run();
    if (!run) return null;
    return 'chapter' in run ? run.chapter : run.runningChapter;
  });
  protected readonly percent = computed(() => {
    const run = this.store.run();
    return run?.total ? (run.done / run.total) * 100 : null;
  });
  protected readonly pillLabel = computed(() => {
    const run = this.store.run();
    if (!run) return '';
    const chapter = this.chapter();
    const details = [
      chapter ? this.i18n.t('analysis.run.pillChapter', { chapter }) : null,
      this.i18n.t(STEP_KEYS[run.step]),
      `${run.done} / ${run.total}`,
    ];
    if (run.failed) details.push(this.i18n.t('analysis.run.pillFailed', { count: run.failed }));
    return details.filter(Boolean).join(' · ');
  });

  protected closeOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  protected async cancel(): Promise<void> {
    this.menuOpen.set(false);
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('analysis.pipeline.cancelRun'),
      message: this.i18n.t('analysis.pipeline.cancelConfirm'),
      confirmLabel: this.i18n.t('analysis.pipeline.cancelRun'),
      cancelLabel: this.i18n.t('analysis.pipeline.keepRunning'),
      danger: true,
    });
    if (confirmed) await this.store.cancel();
  }
}
