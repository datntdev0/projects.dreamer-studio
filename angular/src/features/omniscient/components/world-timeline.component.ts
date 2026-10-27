import { Component, computed, inject, signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { formatCount, formatDateTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LayoutService } from '@shell/layout/layout.service';
import { chapterStatusIcons } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

@Component({
  selector: 'ds-world-timeline',
  imports: [ButtonDirective, CheckboxComponent, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './world-timeline.component.html',
})
export class WorldTimelineComponent {
  protected readonly store = inject(OmniscientStore);
  protected readonly layout = inject(LayoutService);
  private readonly i18n = inject(I18nService);
  private readonly draft = signal<number | null>(null);

  protected readonly staleIcon = chapterStatusIcons.stale;
  protected readonly failedIcon = chapterStatusIcons.failed;
  protected readonly indexes = computed(() =>
    this.store
      .analysedChapters()
      .map((item) => item.index)
      .sort((a, b) => a - b),
  );
  protected readonly min = computed(() => this.indexes()[0] ?? 1);
  protected readonly max = computed(() => this.indexes().at(-1) ?? 1);
  protected readonly value = computed(() => this.draft() ?? this.store.asOfChapter() ?? this.max());
  protected readonly whole = computed(() => this.draft() === null && this.store.asOfChapter() === null);
  protected readonly previous = computed(
    () =>
      this.indexes()
        .filter((index) => index < this.value())
        .at(-1) ?? null,
  );
  protected readonly next = computed(() => this.indexes().find((index) => index > this.value()) ?? null);
  protected readonly mergedAt = computed(() => {
    const iso = this.store.world()?.mergedAt;
    return iso ? formatDateTime(iso, this.i18n.language()) : '';
  });
  protected readonly counts = computed(() => {
    const summary = this.store.summary();
    const language = this.i18n.language();
    return {
      analysed: formatCount(summary.analysed, language),
      total: formatCount(summary.total, language),
      stale: formatCount(summary.stale, language),
      failed: formatCount(summary.failed, language),
      pending: formatCount(this.store.merge()?.pending ?? 0, language),
      chapter: formatCount(this.value(), language),
    };
  });

  protected onSlide(event: Event): void {
    this.draft.set(Number((event.target as HTMLInputElement).value));
  }

  protected onSlideEnd(event: Event): void {
    this.draft.set(null);
    this.store.setTimeline(Number((event.target as HTMLInputElement).value));
  }

  protected go(chapter: number | null): void {
    if (chapter !== null) this.store.setTimeline(chapter);
  }

  protected setOnly(only: boolean): void {
    this.store.setTimeline(this.store.asOfChapter() ?? this.value(), only);
  }
}
