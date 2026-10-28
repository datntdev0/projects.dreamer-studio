import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import type { Signal } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import type { ChapterTranslationStatus } from '@dreamer/shared/models/translation';
import type { ChapterTranslationSummary } from '@dreamer/shared/models/translation';

@Component({
  selector: 'ds-translation-status',
  imports: [DotComponent, IconComponent, TooltipDirective],
  host: { class: 'translation-status-host' },
  templateUrl: './translation-status.component.html',
})
export class TranslationStatusComponent {
  readonly summary = input.required<ChapterTranslationSummary>();
  readonly running = input<boolean>(false);
  private readonly i18n: I18nService = inject(I18nService);
  protected readonly status: Signal<string> = computed(() => (this.running() ? 'running' : this.summary().status));
  protected readonly issueCount: Signal<string> = computed(() =>
    new Intl.NumberFormat(this.i18n.language()).format(this.summary().issues),
  );
  protected readonly label: Signal<string> = computed(() => {
    const summary: ChapterTranslationSummary = this.summary();
    const keys: Record<ChapterTranslationStatus, string> = {
      'not-translated': 'notTranslated',
      translated: 'translated',
      'has-issues': summary.issues === 1 ? 'issuesOne' : 'issuesMany',
      stale: summary.staleReason === 'glossary' ? 'staleGlossary' : 'staleSource',
      failed: summary.error ? 'failedWith' : 'failed',
    };
    const key: string = this.running() ? 'running' : keys[summary.status];
    const label: string = this.i18n.t(`library.translation.status.${key}`, {
      count: this.issueCount(),
      error: summary.error ?? '',
    });
    return summary.edited ? `${label}, ${this.i18n.t('library.translation.status.edited')}` : label;
  });
}
