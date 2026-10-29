import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { SegmentedComponent } from '@components/form/segmented.component';
import type { SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { glossaryKeyId } from '@dreamer/shared/core/glossary';
import type { EntityType } from '@dreamer/shared/models/analysis';
import type {
  GlossaryKey,
  GlossaryRow,
  GlossaryStatus,
  GlossaryTermKind,
  TargetLanguage,
} from '@dreamer/shared/models/translation';
import { ENTITY_TYPES, entityTypeIcons, entityTypeKeys } from '../../omniscient/omniscient-labels';
import { fold } from '../library-format';
import { TranslationStore } from '../translation.store';

type RowStatus = GlossaryStatus | 'all';

const KIND_ORDER: GlossaryTermKind[] = ['name', 'alias', 'title'];

@Component({
  selector: 'ds-glossary-view',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    IconComponent,
    PillComponent,
    RouterLink,
    SegmentedComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './glossary-view.component.html',
  host: { 'data-testid': 'glossary-view' },
})
export class GlossaryViewComponent {
  protected readonly store = inject(TranslationStore);
  protected readonly novelStore = inject(CurrentNovelStore);
  private readonly i18n = inject(I18nService);
  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  protected readonly entityTypes = ENTITY_TYPES;
  protected readonly typeKeys = entityTypeKeys;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly query = signal('');
  protected readonly type = signal<EntityType | 'all'>('all');
  protected readonly status = signal<RowStatus>('all');
  protected readonly drafts = signal<Map<string, string>>(new Map());
  protected readonly saving = signal<Set<string>>(new Set());
  protected readonly errors = signal<Map<string, string>>(new Map());
  protected readonly announcement = signal('');
  protected readonly rowHeight =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-h-lg')) || 36;
  protected readonly page = this.store.glossary;
  protected readonly rows = computed(() => this.page()?.rows ?? []);
  protected readonly ordered = computed(() =>
    [...this.rows()].sort((a, b) => {
      const typeOrder = ENTITY_TYPES.indexOf(a.entityType) - ENTITY_TYPES.indexOf(b.entityType);
      if (typeOrder) return typeOrder;
      const nameOrder = a.entityName.localeCompare(b.entityName);
      if (nameOrder) return nameOrder;
      const kindOrder = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
      return kindOrder || (a.term ?? '').localeCompare(b.term ?? '');
    }),
  );
  private readonly baseRows = computed(() => {
    const query = fold(this.query().trim());
    const chapter = this.store.selectedChapter();
    return this.ordered().filter(
      (row) =>
        (chapter === null || row.chapterIndexes.includes(chapter)) &&
        (this.type() === 'all' || row.entityType === this.type()) &&
        (!query || [row.entityName, row.term ?? '', row.translation ?? ''].some((text) => fold(text).includes(query))),
    );
  });
  protected readonly visible = computed(() =>
    this.baseRows().filter((row) => this.status() === 'all' || row.status === this.status()),
  );
  protected readonly statusOptions = computed<SegmentedOption[]>(() => {
    const rows = this.baseRows();
    return (
      [
        ['all', 'layers', rows.length],
        ['untranslated', 'minus', rows.filter((row) => row.status === 'untranslated').length],
        ['llm', 'sparkles', rows.filter((row) => row.status === 'llm').length],
        ['user', 'pencil', rows.filter((row) => row.status === 'user').length],
      ] as const
    ).map(([value, icon, count]) => ({
      value,
      icon,
      label: this.i18n.t(`library.translation.glossary.status.${value}Count`, { count: this.number(count) }),
    }));
  });
  protected readonly untranslated = computed(() => this.rows().filter((row) => row.status === 'untranslated').length);
  private saveChain: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, { value: string | null; language: TargetLanguage | null }>();

  constructor() {
    effect(() => {
      this.store.language();
      untracked(() => this.resetDrafts());
    });
    effect(() => {
      this.store.selectedChapter();
      untracked(() => this.viewport()?.scrollToIndex(0));
    });
    effect((onCleanup) => {
      const viewport = this.viewport();
      if (!viewport) return;
      const observer = new ResizeObserver(() => viewport.checkViewportSize());
      observer.observe(viewport.elementRef.nativeElement);
      onCleanup(() => observer.disconnect());
    });
  }

  protected number(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }
  protected rowKey(row: GlossaryKey): string {
    return glossaryKeyId(row);
  }
  protected testKey(row: GlossaryKey): string {
    return this.rowKey(row).replace(/[^\p{L}\p{N}]/gu, '-');
  }
  protected trackRow = (_index: number, row: GlossaryRow): string => this.rowKey(row);
  protected rowName(row: GlossaryRow): string {
    return row.term ?? row.entityName;
  }
  protected value(row: GlossaryRow): string {
    return this.drafts().get(this.rowKey(row)) ?? row.translation ?? '';
  }

  protected setDraft(row: GlossaryRow, event: Event): void {
    const key = this.rowKey(row);
    const drafts = new Map(this.drafts());
    drafts.set(key, (event.target as HTMLInputElement).value);
    this.drafts.set(drafts);
    this.clearError(key);
  }

  protected onKey(event: KeyboardEvent, row: GlossaryRow, index: number): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dropDraft(this.rowKey(row));
      (event.target as HTMLInputElement).value = row.translation ?? '';
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.commit(row);
    } else if (event.key === 'Tab') {
      const next = index + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= this.visible().length) return;
      event.preventDefault();
      this.commit(row);
      this.focusInput(next);
    }
  }

  protected commit(row: GlossaryRow, explicit?: string | null): void {
    if (this.store.locked()) return;
    const key = this.rowKey(row);
    const value = explicit === undefined ? this.value(row).trim() || null : explicit;
    if (value === row.translation) {
      this.dropDraft(key);
      return;
    }
    if (explicit === null) this.drafts.update((items) => new Map(items).set(key, ''));
    const language = this.store.language();
    const previous = this.pending.get(key);
    if (previous?.value === value && previous.language === language) return;
    const pending = { value, language };
    this.pending.set(key, pending);
    this.saving.update((items) => new Set(items).add(key));
    this.clearError(key);
    this.saveChain = this.saveChain
      .then(async () => {
        if (language !== this.store.language()) return;
        const success = await this.store.editGlossary(row, value);
        if (success) {
          if (this.drafts().get(key)?.trim() === (value ?? '')) this.dropDraft(key);
          this.announcement.set(this.i18n.t('library.translation.glossary.table.saved'));
        } else {
          const errors = new Map(this.errors());
          errors.set(key, this.store.errorText(this.store.error(), 'library.translation.glossary.table.saveFailed'));
          this.errors.set(errors);
          this.announcement.set(errors.get(key) ?? '');
        }
      })
      .finally(() => {
        if (this.pending.get(key) !== pending) return;
        this.pending.delete(key);
        this.saving.update((items) => {
          const next = new Set(items);
          next.delete(key);
          return next;
        });
      });
  }

  protected setType(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as EntityType | 'all');
    this.viewport()?.scrollToIndex(0);
  }
  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.viewport()?.scrollToIndex(0);
  }
  protected setStatus(value: string): void {
    this.status.set(value as RowStatus);
    this.viewport()?.scrollToIndex(0);
  }
  protected clearFilters(): void {
    this.query.set('');
    this.type.set('all');
    this.status.set('all');
    this.store.selectedChapter.set(null);
    this.viewport()?.scrollToIndex(0);
  }
  private resetDrafts(): void {
    this.drafts.set(new Map());
    this.errors.set(new Map());
    this.saving.set(new Set());
    this.pending.clear();
  }
  private focusInput(index: number): void {
    const row = this.visible()[index];
    if (!row) return;
    this.viewport()?.scrollToIndex(index);
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(`[data-testid="glossary-input-${this.testKey(row)}"]`)?.focus(),
    );
  }

  private dropDraft(key: string): void {
    const drafts = new Map(this.drafts());
    drafts.delete(key);
    this.drafts.set(drafts);
    this.clearError(key);
  }
  private clearError(key: string): void {
    const errors = new Map(this.errors());
    errors.delete(key);
    this.errors.set(errors);
  }
}
