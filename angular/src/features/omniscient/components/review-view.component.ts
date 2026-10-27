import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { PillComponent } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { formatDateTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { clashingAliases, nameKey } from '@dreamer/shared/core/analysis-checks';
import { canAccept, REASON_SEVERITY } from '@dreamer/shared/core/analysis-review';
import type { ReviewSeverity } from '@dreamer/shared/core/analysis-review';
import type { EntityType, FailReason, ItemStatus, ReviewEdit, ReviewItem } from '@dreamer/shared/models/analysis';
import type { ReviewRelated, ReviewStatusFilter } from '@dreamer/shared/models/analysis';
import { entityTypeIcons, entityTypeKeys, itemStatusKeys, itemStatusKinds } from '../omniscient-labels';
import { REASON_ORDER, reasonHintKeys, reasonIcons, reasonKeys } from '../omniscient-labels';
import { MergeButtonComponent } from './merge-button.component';
import { OmniscientStore } from '../omniscient.store';

type ReviewKind = 'entity' | 'fact' | 'all';
type SeverityFilter = ReviewSeverity | 'all';

interface ReviewProp {
  key: string;
  value: string;
  type?: EntityType | 'unknown';
}

interface ReviewRow {
  key: string;
  items: ReviewItem[];
  status: ItemStatus;
}

interface ReviewIssue {
  key: string;
  reason: FailReason;
  kind: 'entity' | 'fact';
  items: ReviewItem[];
  rows: ReviewRow[];
  open: boolean;
  variants: boolean;
}

interface ReviewSection {
  reason: FailReason;
  severity: ReviewSeverity;
  issues: ReviewIssue[];
  open: number;
}

const STATUS_FILTERS: ReviewStatusFilter[] = ['open', 'all', 'verified', 'failed', 'accepted', 'rejected'];
const KIND_FILTERS: ReviewKind[] = ['all', 'entity', 'fact'];
const SEVERITY_FILTERS: SeverityFilter[] = ['all', 'error', 'warning'];
const VARIANT_REASONS: FailReason[] = ['name-conflict'];

function target(item: ReviewItem): { id: string; status: ItemStatus; reason?: FailReason; issue?: FailReason } {
  return item.entity ?? item.fact!;
}

function issueReason(item: ReviewItem): FailReason {
  return target(item).issue ?? target(item).reason ?? 'words-not-found';
}

function itemKey(item: ReviewItem): string {
  return `${item.chapterIndex}:${item.itemKind}:${target(item).id}`;
}

function variantKey(reason: FailReason, item: ReviewItem): string {
  return reason === 'name-conflict' ? (item.entity?.type ?? itemKey(item)) : 'all';
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

function toRow(key: string, items: ReviewItem[]): ReviewRow {
  const failed = items.some((item) => target(item).status === 'failed');
  return { key, items, status: failed ? 'failed' : target(items[0]).status };
}

function toIssue(key: string, items: ReviewItem[]): ReviewIssue {
  const reason = issueReason(items[0]);
  const rows = [...groupBy(items, (item) => variantKey(reason, item))].map(([rowKey, rowItems]) =>
    toRow(rowKey, rowItems),
  );
  return {
    key,
    reason,
    kind: items[0].itemKind,
    items,
    rows,
    open: rows.some((row) => row.status === 'failed'),
    variants: VARIANT_REASONS.includes(reason),
  };
}

@Component({
  selector: 'ds-review-view',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    MergeButtonComponent,
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
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly kindFilters = KIND_FILTERS;
  protected readonly severityFilters = SEVERITY_FILTERS;
  protected readonly reasonIcons = reasonIcons;
  protected readonly reasonHintKeys = reasonHintKeys;
  protected readonly severity = signal<SeverityFilter>('all');
  protected readonly severityIcons: Record<ReviewSeverity, string> = {
    error: 'alert-circle',
    warning: 'alert-triangle',
  };
  protected readonly severityKinds = { error: 'danger', warning: 'warning' } as const;
  protected readonly severityKeys: Record<SeverityFilter, string> = {
    all: 'analysis.review.filter.allSeverities',
    error: 'analysis.review.severity.error',
    warning: 'analysis.review.severity.warning',
  };
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
  protected readonly mergedAt = computed(() => {
    const iso = this.store.merge()?.mergedAt;
    return iso ? formatDateTime(iso, this.i18n.language()) : '';
  });
  private readonly allSections = computed<ReviewSection[]>(() => {
    const items = this.store.review()?.items ?? [];
    const issues = [...groupBy(items, (item) => item.issueKey ?? `${issueReason(item)}:${itemKey(item)}`)].map(
      ([key, issueItems]) => toIssue(key, issueItems),
    );
    return REASON_ORDER.map((reason) => {
      const sectionIssues = issues.filter((issue) => issue.reason === reason);
      const open = sectionIssues.filter((issue) => issue.open).length;
      return { reason, severity: REASON_SEVERITY[reason], issues: sectionIssues, open };
    }).filter((section) => section.issues.length > 0);
  });
  protected readonly sections = computed(() =>
    this.allSections().filter((section) => this.severity() === 'all' || section.severity === this.severity()),
  );
  protected readonly severityCount = computed(() => {
    const open = (severity: ReviewSeverity): number =>
      this.allSections()
        .filter((section) => section.severity === severity)
        .reduce((total, section) => total + section.open, 0);
    return { errors: open('error'), warnings: open('warning') };
  });

  protected reasonLabel(reason: FailReason): string {
    return this.i18n.t(reasonKeys[reason]);
  }

  protected statusLabel(status: ItemStatus): string {
    return this.i18n.t(itemStatusKeys[status]);
  }

  protected typeIcon(type: EntityType | 'unknown'): string {
    return (entityTypeIcons[type] as string | undefined) ?? 'box';
  }

  protected statusKind(status: ItemStatus): (typeof itemStatusKinds)[ItemStatus] {
    return itemStatusKinds[status];
  }

  protected statusIcon(status: ItemStatus): string {
    return this.statusIcons[status];
  }

  protected typeLabel(type: EntityType | 'unknown'): string {
    const key = entityTypeKeys[type] as string | undefined;
    return key ? this.i18n.t(key) : type;
  }

  protected entityOf(row: ReviewRow): ReviewItem['entity'] {
    return row.items[0].entity;
  }

  protected factProps(issue: ReviewIssue): ReviewProp[] {
    const first = issue.items[0];
    const fact = first.fact!;
    const subject = this.entityProp('analysis.review.prop.subject', first, fact.subjectId, first.subjectName);
    const predicate: ReviewProp = { key: 'analysis.review.prop.predicate', value: fact.predicate };
    const object: ReviewProp[] =
      fact.kind === 'scalar'
        ? []
        : [this.entityProp('analysis.review.prop.object', first, fact.objectId, first.objectName)];
    const label: ReviewProp[] = fact.label ? [{ key: 'analysis.review.prop.label', value: fact.label }] : [];
    return [subject, predicate, ...object, ...label];
  }

  protected contextOf(row: ReviewRow): ReviewItem {
    return row.items.find((item) => item.context) ?? row.items[0];
  }

  protected relatedOf(issue: ReviewIssue): ReviewRelated[] {
    return issue.items.flatMap((item) => item.related ?? []);
  }

  protected clashingAlias(issue: ReviewIssue): string {
    const entity = issue.items[0].entity;
    const names = new Set(this.relatedOf(issue).map((item) => nameKey(item.name)));
    return entity ? (clashingAliases(entity, names)[0] ?? '') : '';
  }

  protected canKeep(row: ReviewRow): boolean {
    return row.status === 'failed' && canAccept(target(row.items[0]).reason);
  }

  protected canKeepAll(issue: ReviewIssue): boolean {
    return issue.variants && issue.rows.filter((row) => this.canKeep(row)).length > 1;
  }

  protected rowId(issue: ReviewIssue, row: ReviewRow): string {
    return `${issue.key}|${row.key}`;
  }

  protected setSeverity(event: Event): void {
    this.severity.set((event.target as HTMLSelectElement).value as SeverityFilter);
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
    this.severity.set('all');
    this.store.setReviewFilter({ status: 'open', kind: 'all', chapter: null });
  }

  protected fix(row: ReviewRow): void {
    this.store.dialog.set({ kind: 'fix', item: row.items[0], items: row.items });
  }

  protected reject(row: ReviewRow): void {
    void this.store.editMany(this.edits(row.items, 'review-reject'));
  }

  protected keep(rows: ReviewRow[]): void {
    const items = rows.filter((row) => this.canKeep(row)).flatMap((row) => row.items);
    void this.store.editMany(this.edits(items, 'review-accept'));
  }

  protected removeAlias(issue: ReviewIssue, alias: string): void {
    const edits: ReviewEdit[] = issue.items
      .filter((item) => item.entity)
      .map((item) => ({
        kind: 'review-fix',
        chapterIndex: item.chapterIndex,
        itemKind: 'entity',
        itemId: item.entity!.id,
        entity: { aliases: item.entity!.aliases.filter((other) => other !== alias) },
      }));
    void this.store.editMany(edits);
  }

  private entityProp(key: string, item: ReviewItem, id: string | undefined, name: string | undefined): ReviewProp {
    const entity = this.store.review()?.entities[item.chapterIndex]?.find((option) => option.id === id);
    return { key, value: name || entity?.name || this.store.entityName(id ?? '') || '—', type: entity?.type };
  }

  private edits(items: ReviewItem[], kind: 'review-reject' | 'review-accept'): ReviewEdit[] {
    return items
      .filter((item) =>
        kind === 'review-reject' ? target(item).status !== 'rejected' : target(item).status === 'failed',
      )
      .map((item) => ({ kind, chapterIndex: item.chapterIndex, itemKind: item.itemKind, itemId: target(item).id }));
  }
}
