import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { SegmentedComponent } from '@components/form/segmented.component';
import type { SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { AnalysisFact, QuoteMatch, WorldEdit, WorldLink, WorldScalar } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeKeys, pluralKey } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

type FactKind = AnalysisFact['kind'];
type QuoteState = 'empty' | 'unchecked' | 'searching' | 'not-found' | 'pick' | 'found';

const MATCH_LIMIT = 20;

interface FactTarget {
  factId: string;
  subjectId: string;
  chapterIndex: number;
  scalar: WorldScalar | null;
  link: WorldLink | null;
}

@Component({
  selector: 'ds-fact-dialog',
  imports: [ButtonDirective, DialogComponent, FieldComponent, IconComponent, SegmentedComponent, TranslatePipe],
  templateUrl: './fact-dialog.component.html',
})
export class FactDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);

  protected readonly typeKeys = entityTypeKeys;
  protected readonly pluralKey = pluralKey;
  protected readonly kind = signal<FactKind>('relationship');
  protected readonly predicate = signal('');
  protected readonly label = signal('');
  protected readonly objectId = signal('');
  protected readonly chapterIndex = signal<number | null>(null);
  protected readonly quote = signal('');
  protected readonly matches = signal<QuoteMatch[] | null>(null);
  protected readonly searching = signal(false);
  protected readonly quoteChapter = signal<number | null>(null);
  protected readonly error = signal('');

  protected readonly request = computed(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'fact' ? dialog : null;
  });
  protected readonly target = computed<FactTarget | null>(() => {
    const request = this.request();
    const factId = request?.factId;
    const chapterIndex = request?.chapterIndex;
    if (!request || !factId || chapterIndex === null || chapterIndex === undefined) return null;
    const scalar =
      this.store.selected()?.scalars.find((item) => item.factId === factId && item.chapterIndex === chapterIndex) ??
      null;
    if (scalar) return { factId, subjectId: request.entityId, chapterIndex, scalar, link: null };
    const link =
      this.store
        .links()
        .find((item) => item.factRefs?.some((ref) => ref.factId === factId && ref.chapterIndex === chapterIndex)) ??
      null;
    return link ? { factId, subjectId: link.source, chapterIndex, scalar: null, link } : null;
  });
  protected readonly subject = computed(() => {
    const id = this.target()?.subjectId ?? this.request()?.entityId;
    return this.store.entities().find((item) => item.id === id) ?? null;
  });
  protected readonly kindOptions = computed<SegmentedOption[]>(() => [
    { value: 'relationship', label: this.i18n.t('analysis.world.relationship'), icon: 'network' },
    { value: 'scalar', label: this.i18n.t('analysis.world.scalar'), icon: 'hash' },
  ]);
  protected readonly predicates = computed(() => {
    const type = this.subject()?.type;
    return (this.store.ontology()?.predicates ?? [])
      .filter((item) => item.kind === this.kind() && !!type && item.subjectTypes.includes(type))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly selectedPredicate = computed(() =>
    this.predicates().find((item) => item.name === this.predicate()),
  );
  protected readonly labeled = computed(() => this.selectedPredicate()?.labeled === true);
  protected readonly objectGroups = computed(() => {
    const types = this.selectedPredicate()?.objectTypes ?? ENTITY_TYPES;
    return types
      .map((type) => ({
        type,
        items: this.store
          .entities()
          .filter((item) => item.type === type && item.id !== this.subject()?.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) => group.items.length);
  });
  protected readonly quoteText = computed(() => this.quote().trim());
  protected readonly pickable = computed(() => (this.matches() ?? []).filter((match) => this.canPick(match)));
  protected readonly shownMatches = computed(() => (this.matches() ?? []).slice(0, MATCH_LIMIT));
  protected readonly hiddenMatches = computed(() => (this.matches()?.length ?? 0) - this.shownMatches().length);
  protected readonly quoteState = computed<QuoteState>(() => {
    if (!this.quoteText()) return 'empty';
    if (this.quoteChapter() !== null) return 'found';
    if (this.searching()) return 'searching';
    if (this.matches() === null) return 'unchecked';
    return this.pickable().length ? 'pick' : 'not-found';
  });
  protected readonly chapter = computed(() => (this.quoteText() ? this.quoteChapter() : this.chapterIndex()));
  protected readonly chapterOptions = computed(() => this.store.status()?.chapters ?? []);
  protected readonly chapterHint = computed(() => {
    if (this.target()) return 'analysis.entity.chapterLocked';
    return this.quoteText() ? 'analysis.entity.chapterFromQuote' : 'analysis.entity.chapterHint';
  });
  protected readonly canSave = computed(
    () =>
      !!this.subject() &&
      !!this.selectedPredicate() &&
      (!this.labeled() || !!this.label().trim()) &&
      this.chapter() !== null &&
      (this.kind() === 'relationship' ? !!this.objectId() : !!this.quoteText()) &&
      !this.store.busy() &&
      !this.store.locked(),
  );

  constructor() {
    effect(() => {
      this.request();
      untracked(() => this.reset());
    });
  }

  protected setKind(kind: string): void {
    this.kind.set(kind as FactKind);
    this.setPredicate(this.predicates()[0]?.name ?? '');
  }

  protected setPredicate(name: string): void {
    this.predicate.set(name);
    if (!this.objectGroups().some((group) => group.items.some((item) => item.id === this.objectId())))
      this.objectId.set(this.objectGroups()[0]?.items[0]?.id ?? '');
  }

  protected setObject(event: Event): void {
    this.objectId.set((event.target as HTMLSelectElement).value);
  }

  protected setChapter(event: Event): void {
    this.chapterIndex.set(Number((event.target as HTMLSelectElement).value));
  }

  protected setQuote(value: string): void {
    this.quote.set(value);
    this.matches.set(null);
    this.quoteChapter.set(null);
  }

  protected canPick(match: QuoteMatch): boolean {
    const target = this.target();
    return !target || match.chapterIndex === target.chapterIndex;
  }

  protected pick(match: QuoteMatch): void {
    if (!this.canPick(match)) return;
    this.quoteChapter.set(match.chapterIndex);
    this.chapterIndex.set(match.chapterIndex);
  }

  protected async find(): Promise<void> {
    const quote = this.quoteText();
    if (!quote || this.searching()) return;
    this.searching.set(true);
    try {
      const matches = await this.store.findQuote(quote);
      if (quote !== this.quoteText()) return;
      this.matches.set(matches);
      if (this.pickable().length === 1) this.pick(this.pickable()[0]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.searching.set(false);
    }
  }

  protected close(): void {
    this.store.dialog.set(null);
  }

  protected async save(): Promise<void> {
    const subject = this.subject();
    const chapterIndex = this.chapter();
    if (!subject || chapterIndex === null || !this.canSave()) return;
    const kind = this.kind();
    const predicate = this.predicate();
    const quote = this.quoteText() || null;
    const object = kind === 'relationship' ? { objectId: this.objectId() } : {};
    const label = this.labeled() ? { label: this.label().trim() } : {};
    const target = this.target();
    const edit: WorldEdit = target
      ? {
          kind: 'fact-edit',
          factId: target.factId,
          chapterIndex: target.chapterIndex,
          patch: { predicate, quote, ...object, ...label },
        }
      : {
          kind: 'fact-add',
          chapterIndex,
          fact: {
            id: crypto.randomUUID(),
            kind,
            predicate,
            subjectId: subject.id,
            quote,
            ...object,
            ...label,
            status: 'verified',
            addedByUser: true,
          },
        };
    if (!(await this.store.edit(edit))) {
      this.error.set(this.store.error() || this.i18n.t('analysis.entity.saveFailed'));
      return;
    }
    this.close();
  }

  private reset(): void {
    const target = this.target();
    const chapters = this.store.analysedChapters().map((item) => item.index);
    const asOf = this.store.asOfChapter();
    const firstSeen = this.subject()?.chapters[0];
    this.kind.set(target?.scalar ? 'scalar' : 'relationship');
    this.predicate.set(target?.scalar?.predicate ?? target?.link?.predicate ?? this.predicates()[0]?.name ?? '');
    this.label.set(target?.link?.label ?? '');
    this.objectId.set(target?.link?.target ?? '');
    this.setPredicate(this.predicate());
    const quote = target?.scalar?.quote ?? target?.link?.quotes[0] ?? '';
    this.quote.set(quote);
    this.matches.set(null);
    this.searching.set(false);
    this.quoteChapter.set(quote ? (target?.chapterIndex ?? null) : null);
    this.chapterIndex.set(
      target?.chapterIndex ?? (asOf !== null && chapters.includes(asOf) ? asOf : (firstSeen ?? chapters[0] ?? null)),
    );
    this.error.set('');
  }
}
