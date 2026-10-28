import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { PillComponent } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { REASON_SEVERITY } from '@dreamer/shared/core/world-checks';
import type { EntityType, FailReason, IssueSeverity, ReviewItem } from '@dreamer/shared/models/analysis';
import { entityTypeIcons, entityTypeKeys, issueDetailKeys } from '../omniscient-labels';
import { issueIcons, issuePillKinds, REASON_ORDER, reasonIcons, reasonKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

type ReviewKind = 'entity' | 'fact' | 'all';
type SeverityFilter = IssueSeverity | 'all';

interface ReviewProp {
  key: string;
  value: string;
  type?: EntityType | 'unknown';
}

interface ReviewSection {
  reason: FailReason;
  severity: IssueSeverity;
  items: ReviewItem[];
}

const KIND_FILTERS: ReviewKind[] = ['all', 'entity', 'fact'];
const SEVERITY_FILTERS: SeverityFilter[] = ['all', 'error', 'warning'];

@Component({
  selector: 'ds-review-view',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    NgTemplateOutlet,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './review-view.component.html',
  host: { class: 'ds-world-review', 'data-testid': 'world-review' },
})
export class ReviewViewComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);
  protected readonly kindFilters = KIND_FILTERS;
  protected readonly severityFilters = SEVERITY_FILTERS;
  protected readonly reasonIcons = reasonIcons;
  protected readonly severity = signal<SeverityFilter>('all');
  protected readonly severityIcons = issueIcons;
  protected readonly severityKinds = issuePillKinds;
  protected readonly severityKeys: Record<SeverityFilter, string> = {
    all: 'analysis.review.filter.allSeverities',
    error: 'analysis.review.severity.error',
    warning: 'analysis.review.severity.warning',
  };
  protected readonly kindFilterKeys: Record<ReviewKind, string> = {
    all: 'analysis.review.filter.allKinds',
    entity: 'analysis.pipeline.entities',
    fact: 'analysis.pipeline.facts',
  };

  protected readonly lockReason = computed(() => {
    if (this.store.run()) return 'analysis.review.lockedRun';
    return this.store.novel()?.lock ? 'analysis.review.lockedNovel' : '';
  });
  protected readonly disabled = computed(() => this.store.locked() || this.store.busy());
  protected readonly sections = computed<ReviewSection[]>(() => {
    const items = this.store.review()?.items ?? [];
    return REASON_ORDER.map((reason) => ({
      reason,
      severity: REASON_SEVERITY[reason],
      items: items.filter((item) => item.issue.reason === reason),
    })).filter(
      (section) => section.items.length > 0 && (this.severity() === 'all' || section.severity === this.severity()),
    );
  });
  protected readonly counts = computed(() => this.store.review()?.counts ?? { errors: 0, warnings: 0 });

  protected reasonLabel(reason: FailReason): string {
    return this.i18n.t(reasonKeys[reason]);
  }

  protected detail(item: ReviewItem): string {
    const { params, reason } = item.issue;
    const type = params['type'];
    return this.i18n.t(issueDetailKeys[reason], type ? { ...params, type: this.typeLabel(type) } : params);
  }

  protected typeIcon(type: EntityType | 'unknown'): string {
    return (entityTypeIcons[type] as string | undefined) ?? 'box';
  }

  protected typeLabel(type: string): string {
    const key = entityTypeKeys[type as EntityType] as string | undefined;
    return key ? this.i18n.t(key) : type;
  }

  protected factProps(item: ReviewItem): ReviewProp[] {
    const fact = item.fact;
    if (!fact) return [];
    const subject = this.entityProp('analysis.review.prop.subject', item, fact.subjectId, fact.subjectName);
    const predicate: ReviewProp = { key: 'analysis.review.prop.predicate', value: fact.predicate };
    const object: ReviewProp[] =
      fact.kind === 'scalar'
        ? []
        : [this.entityProp('analysis.review.prop.object', item, fact.objectId, fact.objectName)];
    const label: ReviewProp[] = fact.label ? [{ key: 'analysis.review.prop.label', value: fact.label }] : [];
    return [subject, predicate, ...object, ...label];
  }

  protected setSeverity(event: Event): void {
    this.severity.set((event.target as HTMLSelectElement).value as SeverityFilter);
  }

  protected setKind(event: Event): void {
    this.store.setReviewFilter({ kind: (event.target as HTMLSelectElement).value as ReviewKind });
  }

  protected setChapter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setReviewFilter({ chapter: value ? Number(value) : null });
  }

  protected resetFilters(): void {
    this.severity.set('all');
    this.store.setReviewFilter({ kind: 'all', chapter: null });
  }

  protected fix(item: ReviewItem): void {
    void this.store.openEdit({ issueKey: item.issue.key });
  }

  private entityProp(key: string, item: ReviewItem, id: string | undefined, name: string | undefined): ReviewProp {
    const entity = item.entities.find((option) => option.id === id);
    return { key, value: name || entity?.name || this.store.entityName(id ?? '') || '—', type: entity?.type };
  }
}
