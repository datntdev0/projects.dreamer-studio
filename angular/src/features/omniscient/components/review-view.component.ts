import { Component, computed, inject } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { PillComponent } from '@components/status/pill.component';
import { formatDateTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { ChapterAnalysisStatus, FailReason, ItemStatus, ReviewItem } from '@dreamer/shared/models/analysis';
import type { ReviewStatusFilter } from '@dreamer/shared/models/analysis';
import { chapterStatusIcons, chapterStatusKeys, entityTypeIcons, entityTypeKeys } from '../omniscient-labels';
import { itemStatusKeys, itemStatusKinds, reasonKeys } from '../omniscient-labels';
import { MergeButtonComponent } from './merge-button.component';
import { OmniscientStore } from '../omniscient.store';

type ReviewKind = 'entity' | 'fact' | 'all';

interface ReviewGroup {
  index: number;
  title: string;
  status: ChapterAnalysisStatus;
  items: ReviewItem[];
}

const STATUS_FILTERS: ReviewStatusFilter[] = ['open', 'all', 'verified', 'failed', 'accepted', 'rejected'];
const KIND_FILTERS: ReviewKind[] = ['all', 'entity', 'fact'];
const ACCEPTABLE: FailReason[] = ['words-not-found', 'quote-not-found'];
const PIPELINE_ERRORS: Record<string, string> = {
  'The analysis process timed out during verification.': 'analysis.pipeline.error.timeout',
  'The model returned an incomplete result file.': 'analysis.pipeline.error.incomplete',
};

@Component({
  selector: 'ds-review-view',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, MergeButtonComponent, PillComponent, TranslatePipe],
  templateUrl: './review-view.component.html',
  host: { class: 'ds-world-review', 'data-testid': 'world-review' },
})
export class ReviewViewComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly kindFilters = KIND_FILTERS;
  protected readonly statusKinds = itemStatusKinds;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly chapterKeys = chapterStatusKeys;
  protected readonly chapterIcons = chapterStatusIcons;
  protected readonly statusIcons: Record<ItemStatus, string> = {
    verified: 'check',
    failed: 'alert-circle',
    accepted: 'flag',
    rejected: 'x',
  };
  protected readonly statusFilterKeys: Record<ReviewStatusFilter, string> = {
    open: 'analysis.review.filter.open',
    all: 'analysis.pipeline.allStatuses',
    verified: 'analysis.pipeline.itemStatus.verified',
    failed: 'analysis.pipeline.itemStatus.failed',
    accepted: 'analysis.pipeline.itemStatus.accepted',
    rejected: 'analysis.pipeline.itemStatus.rejected',
  };
  protected readonly kindFilterKeys: Record<ReviewKind, string> = {
    all: 'analysis.review.filter.allKinds',
    entity: 'analysis.pipeline.entities',
    fact: 'analysis.pipeline.facts',
  };

  protected readonly disabled = computed(() => this.store.locked() || this.store.busy());
  protected readonly lockReason = computed(() => {
    if (this.store.run()) return 'analysis.review.lockedRun';
    return this.store.novel()?.lock ? 'analysis.review.lockedNovel' : '';
  });
  protected readonly failedChapters = computed(() => this.store.review()?.failedChapters ?? []);
  protected readonly itemCount = computed(() => this.store.review()?.items.length ?? 0);
  protected readonly mergedAt = computed(() => {
    const iso = this.store.merge()?.mergedAt;
    return iso ? formatDateTime(iso, this.i18n.language()) : '';
  });
  protected readonly groups = computed<ReviewGroup[]>(() => {
    const groups = new Map<number, ReviewGroup>();
    const chapters = this.store.reviewChapters();
    for (const item of this.store.review()?.items ?? []) {
      const status = chapters.find((chapter) => chapter.index === item.chapterIndex)?.status ?? 'has-issues';
      const group = groups.get(item.chapterIndex) ?? {
        index: item.chapterIndex,
        title: item.chapterTitle,
        status,
        items: [],
      };
      group.items.push(item);
      groups.set(item.chapterIndex, group);
    }
    return [...groups.values()].sort((a, b) => a.index - b.index);
  });

  protected itemId(item: ReviewItem): string {
    return item.entity?.id ?? item.fact?.id ?? '';
  }

  protected status(item: ReviewItem): ItemStatus {
    return item.entity?.status ?? item.fact?.status ?? 'verified';
  }

  protected reason(item: ReviewItem): FailReason | undefined {
    return item.entity?.reason ?? item.fact?.reason;
  }

  protected failReason(item: ReviewItem): string {
    const reason = this.reason(item);
    const shown = this.status(item) === 'failed' && reason && !(ACCEPTABLE.includes(reason) && !item.context);
    return shown ? this.i18n.t(reasonKeys[reason]) : '';
  }

  protected statusLabel(status: ItemStatus): string {
    return this.i18n.t(itemStatusKeys[status]);
  }

  protected typeLabel(item: ReviewItem): string {
    if (item.entity) return this.i18n.t(entityTypeKeys[item.entity.type]);
    return this.i18n.t(item.fact?.kind === 'scalar' ? 'analysis.pipeline.scalar' : 'analysis.pipeline.relationship');
  }

  protected typeIcon(item: ReviewItem): string {
    if (item.entity) return entityTypeIcons[item.entity.type];
    return item.fact?.kind === 'scalar' ? 'hash' : 'network';
  }

  protected subject(item: ReviewItem): string {
    return item.subjectName || this.store.entityName(item.fact?.subjectId ?? '');
  }

  protected object(item: ReviewItem): string {
    const fact = item.fact;
    if (!fact) return '';
    return fact.kind === 'scalar' ? (fact.value ?? '') : item.objectName || this.store.entityName(fact.objectId ?? '');
  }

  protected claimed(item: ReviewItem): string {
    return item.entity ? (item.entity.wordsFound[0] ?? item.entity.name) : (item.fact?.quote ?? '');
  }

  protected missingKey(item: ReviewItem): string {
    if (item.entity) return 'analysis.review.wordsMissing';
    return item.fact?.quote ? 'analysis.pipeline.quoteNotFound' : 'analysis.pipeline.noQuote';
  }

  protected canAccept(item: ReviewItem): boolean {
    const reason = this.reason(item);
    return this.status(item) === 'failed' && !!reason && ACCEPTABLE.includes(reason);
  }

  protected pipelineError(error?: string): string {
    if (!error) return this.i18n.t('analysis.pipeline.status.failed');
    return PIPELINE_ERRORS[error] ? this.i18n.t(PIPELINE_ERRORS[error]) : error;
  }

  protected setStatus(event: Event): void {
    this.store.setReviewFilter({ status: (event.target as HTMLSelectElement).value as ReviewStatusFilter });
  }

  protected setKind(event: Event): void {
    this.store.setReviewFilter({ kind: (event.target as HTMLSelectElement).value as ReviewKind });
  }

  protected setChapter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setReviewFilter({ chapter: value ? Number(value) : null });
  }

  protected resetFilters(): void {
    this.store.setReviewFilter({ status: 'open', kind: 'all', chapter: null });
  }

  protected review(item: ReviewItem, kind: 'review-reject' | 'review-accept'): void {
    void this.store.edit({ kind, chapterIndex: item.chapterIndex, itemKind: item.itemKind, itemId: this.itemId(item) });
  }
}
