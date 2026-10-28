import { booleanAttribute, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { ChipInputComponent } from '@components/form/chip-input.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { hasProperty } from '@dreamer/shared/core/ontology-rules';
import { addedFact, applyDraftEdits, creatorOf, factKey, mergeEntities } from '@dreamer/shared/core/world-edit';
import { patchEntity, patchFact, removeEntity, removeFact, touchesEntity } from '@dreamer/shared/core/world-edit';
import { undoDraftEdit } from '@dreamer/shared/core/world-edit';
import type { DraftState } from '@dreamer/shared/core/world-edit';
import type { EntityPatch, EntityType, FactRef, Ontology, WorldDraftEdit } from '@dreamer/shared/models/analysis';
import type { WorldEditEntity, WorldEditPreview, WorldEditScope, WorldFact } from '@dreamer/shared/models/analysis';
import type { WorldIssue } from '@dreamer/shared/models/analysis';
import { entityTypeIcons, entityTypeKeys, issueDetailKeys, issueIcons, reasonKeys } from '../omniscient-labels';

type ItemState = 'new' | 'edited' | 'deleted' | 'merged' | 'removed' | 'same';
type PreviewState = 'idle' | 'checking' | 'resolved' | 'open' | 'clean' | 'warn';

interface EntityCard {
  key: string;
  entity: WorldEditEntity;
  state: ItemState;
  involved: boolean;
  mergedInto: string;
}

interface FactCard {
  key: string;
  fact: WorldFact;
  state: ItemState;
  involved: boolean;
}

interface Option {
  id: string;
  label: string;
}

interface SplitForm {
  entityId: string;
  name: string;
  type: EntityType;
  aliases: string[];
  facts: FactRef[];
}

const EMPTY: DraftState = { entities: [], facts: [] };

const STATE_KEYS: Record<ItemState, string> = {
  new: 'analysis.edit.state.new',
  edited: 'analysis.edit.state.edited',
  deleted: 'analysis.edit.state.deleted',
  merged: 'analysis.edit.state.merged',
  removed: 'analysis.edit.state.removed',
  same: '',
};

const STATE_PILLS: Record<ItemState, 'info' | 'warning' | 'neutral'> = {
  new: 'info',
  edited: 'warning',
  deleted: 'neutral',
  merged: 'neutral',
  removed: 'neutral',
  same: 'neutral',
};

const PREVIEW_KEYS: Record<PreviewState, string> = {
  idle: 'analysis.edit.preview.idle',
  checking: 'analysis.edit.preview.checking',
  resolved: 'analysis.edit.preview.resolved',
  open: 'analysis.edit.preview.open',
  clean: 'analysis.edit.preview.clean',
  warn: 'analysis.edit.preview.warn',
};

const PREVIEW_ICONS: Record<PreviewState, string> = {
  idle: 'info',
  checking: 'clock',
  resolved: 'check',
  open: 'alert-circle',
  clean: 'check',
  warn: 'alert-triangle',
};

const FIELD_KEYS: Record<string, string> = {
  name: 'analysis.review.prop.entity',
  type: 'analysis.review.prop.entityType',
  aliases: 'analysis.review.prop.aliases',
  titles: 'analysis.review.prop.titles',
  subjectId: 'analysis.review.prop.subject',
  predicate: 'analysis.review.prop.predicate',
  objectId: 'analysis.review.prop.object',
  label: 'analysis.review.prop.label',
  quote: 'analysis.review.prop.fact',
};

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toggled<T>(items: T[], item: T, on: boolean): T[] {
  const rest = items.filter((value) => !sameJson(value, item));
  return on ? [...rest, item] : rest;
}

export function chapterRanges(chapters: number[]): string {
  const sorted = [...new Set(chapters)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;

  for (const chapter of sorted.slice(1)) {
    if (chapter === end + 1) {
      end = chapter;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = chapter;
    end = chapter;
  }

  if (start !== undefined) ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(',');
}

@Component({
  selector: 'ds-world-edit-dialog',
  imports: [
    ButtonDirective,
    CheckboxComponent,
    ChipInputComponent,
    DialogComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './world-edit-dialog.component.html',
})
export class WorldEditDialogComponent {
  readonly open = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly scope = input<WorldEditScope | null>(null);
  readonly ontology = input<Ontology | null>(null);
  readonly preview = input<WorldEditPreview | null>(null);
  readonly checking = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly busy = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly draftChange = output<WorldDraftEdit[]>();
  readonly confirmed = output<WorldDraftEdit[]>();
  readonly closed = output<void>();

  private readonly i18n = inject(I18nService);
  protected readonly edits = signal<WorldDraftEdit[]>([]);
  protected readonly expanded = signal<Set<string>>(new Set<string>());
  protected readonly selected = signal<string[]>([]);
  protected readonly mergeTarget = signal<string | null>(null);
  protected readonly split = signal<SplitForm | null>(null);
  protected readonly changesOpen = signal(false);
  protected readonly typeIcons = entityTypeIcons;
  protected readonly stateKeys = STATE_KEYS;
  protected readonly statePills = STATE_PILLS;
  protected readonly previewKeys = PREVIEW_KEYS;
  protected readonly previewIcons = PREVIEW_ICONS;
  protected readonly reasonKeys = reasonKeys;
  protected readonly issueIcons = issueIcons;
  protected readonly chapterRanges = chapterRanges;

  private readonly base = computed<DraftState>(() => this.scope() ?? EMPTY);
  private readonly current = computed<DraftState>(() => applyDraftEdits(this.base(), this.edits()));
  protected readonly issue = computed(() => this.scope()?.issue ?? null);
  protected readonly types = computed<EntityType[]>(() => this.ontology()?.entityTypes ?? []);

  protected readonly detail = computed(() => {
    const issue = this.issue();
    return issue ? this.i18n.t(issueDetailKeys[issue.reason], this.withTypeLabel(issue.params)) : '';
  });

  protected readonly entityCards = computed<EntityCard[]>(() => {
    const edits = this.edits();
    const created = edits.flatMap((edit) =>
      edit.kind === 'entity-add' ? [edit.entity] : edit.kind === 'entity-split' ? [edit.newEntity] : [],
    );
    const involved = this.issue()?.entityIds ?? [];
    const resolved = this.previewState() === 'resolved';
    return [...this.base().entities, ...created].map((original) => {
      const now = this.current().entities.find((entity) => entity.id === original.id);
      const merge = edits.find((edit) => edit.kind === 'entity-merge' && edit.sourceIds.includes(original.id));
      return {
        key: original.id,
        entity: now ?? original,
        state: this.entityState(original, now),
        involved: !resolved && involved.includes(original.id),
        mergedInto: merge?.kind === 'entity-merge' ? this.entityName(merge.targetId, '') : '',
      };
    });
  });

  protected readonly factCards = computed<FactCard[]>(() => {
    const added = this.edits().flatMap((edit) => (edit.kind === 'fact-add' ? [edit.fact] : []));
    const ref = this.issue()?.fact;
    const resolved = this.previewState() === 'resolved';
    const baseCards = this.base().facts.map((original) => {
      const now = this.current().facts.find((fact) => factKey(fact) === factKey(original));
      return {
        key: factKey(original),
        fact: now ?? original,
        state: this.factState(original, now),
        involved: !resolved && !!ref && ref.factId === original.id && ref.chapterIndex === original.chapterIndex,
      };
    });
    const addedCards = added.map((fact) => ({ key: fact.id, fact, state: 'new' as const, involved: false }));
    return [...baseCards, ...addedCards];
  });

  protected readonly entityOptions = computed<Option[]>(() => {
    const listed = this.current().entities;
    const known = new Set([...this.base().entities, ...listed].map((entity) => entity.id));
    const outside = (this.scope()?.catalog ?? []).filter((entity) => !known.has(entity.id));
    return [...listed, ...outside]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entity) => ({ id: entity.id, label: this.entityLabel(entity) }));
  });

  protected readonly selectedCards = computed(() =>
    this.entityCards().filter((card) => this.selected().includes(card.key) && this.isPresent(card)),
  );

  protected readonly changes = computed(() => this.edits().map((edit) => ({ edit, text: this.describe(edit) })));

  protected readonly previewState = computed<PreviewState>(() => {
    const preview = this.preview();
    if (!this.edits().length) return 'idle';
    if (this.checking() || !preview) return 'checking';
    if (this.issue()) return preview.resolved ? 'resolved' : 'open';
    return preview.added.length ? 'warn' : 'clean';
  });

  protected readonly incomplete = computed(() => this.current().entities.some((entity) => !entity.name.trim()));

  protected readonly canConfirm = computed(() => {
    const state = this.previewState();
    const ready = this.issue() ? state === 'resolved' : state === 'clean' || state === 'warn';
    return ready && !this.incomplete() && !this.busy();
  });

  constructor() {
    effect(() => {
      const scope = this.scope();
      if (this.open()) untracked(() => this.reset(scope));
    });
    effect(() => {
      const edits = this.edits();
      untracked(() => this.draftChange.emit(edits));
    });
  }

  protected typeLabel(type: string): string {
    const key = entityTypeKeys[type as EntityType] as string | undefined;
    return key ? this.i18n.t(key) : type;
  }

  protected entityLabel(entity: WorldEditEntity): string {
    return `${entity.name || this.i18n.t('analysis.edit.unnamed')} · ${this.typeLabel(entity.type)}`;
  }

  protected entityName(id: string | undefined, fallback: string | undefined): string {
    const entity = this.findEntity(id);
    return entity ? entity.name || this.i18n.t('analysis.edit.unnamed') : (fallback ?? '?');
  }

  protected hasEntity(id: string | undefined): boolean {
    return !!this.findEntity(id);
  }

  protected isPresent(card: EntityCard | FactCard): boolean {
    return card.state !== 'deleted' && card.state !== 'merged' && card.state !== 'removed';
  }

  protected predicatesOf(fact: WorldFact, isNew: boolean): string[] {
    return (this.ontology()?.predicates ?? [])
      .filter((item) => isNew || item.kind === fact.kind)
      .map((item) => item.name);
  }

  protected labeled(fact: WorldFact): boolean {
    return this.ontology()?.predicates.find((item) => item.name === fact.predicate)?.labeled === true;
  }

  protected hasField(entity: WorldEditEntity, property: 'alias' | 'title'): boolean {
    const values = property === 'alias' ? entity.aliases : entity.titles;
    return hasProperty(this.ontology(), entity.type, property) || values.length > 0;
  }

  protected isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  protected toggle(key: string): void {
    this.expanded.update((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected setEntity(id: string, patch: EntityPatch): void {
    this.edits.update((edits) => patchEntity(edits, this.base(), id, patch));
  }

  protected setEntityText(id: string, field: 'name' | 'type', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.setEntity(id, field === 'name' ? { name: value } : { type: value as EntityType });
  }

  protected setFact(fact: WorldFact, event: Event, field: 'subjectId' | 'objectId' | 'label' | 'quote'): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    this.edits.update((edits) => patchFact(edits, this.base(), this.target(fact), { [field]: value }));
  }

  protected setPredicate(fact: WorldFact, event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const kind = this.ontology()?.predicates.find((item) => item.name === name)?.kind ?? fact.kind;
    const patch: Partial<WorldFact> =
      kind === fact.kind
        ? { predicate: name }
        : { predicate: name, kind, objectId: kind === 'scalar' ? undefined : '' };
    this.edits.update((edits) => patchFact(edits, this.base(), this.target(fact), patch));
  }

  protected setChapter(fact: WorldFact, event: Event): void {
    const chapterIndex = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1));
    this.edits.update((edits) => patchFact(edits, this.base(), this.target(fact), { chapterIndex }));
  }

  protected isNewFact(fact: WorldFact): boolean {
    return !!addedFact(this.edits(), fact.id);
  }

  protected deleteEntity(id: string): void {
    this.edits.update((edits) => removeEntity(edits, id));
    this.selected.update((ids) => ids.filter((item) => item !== id));
  }

  protected deleteFact(fact: WorldFact): void {
    this.edits.update((edits) => removeFact(edits, this.target(fact)));
  }

  protected restoreEntity(id: string): void {
    this.edits.update((edits) => edits.filter((edit) => edit.kind !== 'entity-delete' || edit.entityId !== id));
  }

  protected restoreFact(fact: WorldFact): void {
    this.edits.update((edits) =>
      edits.filter(
        (edit) => edit.kind !== 'fact-delete' || edit.factId !== fact.id || edit.chapterIndex !== fact.chapterIndex,
      ),
    );
  }

  protected undo(edit: WorldDraftEdit): void {
    this.edits.update((edits) => undoDraftEdit(edits, edit));
  }

  protected select(id: string, on: boolean): void {
    this.selected.update((ids) => toggled(ids, id, on));
    this.mergeTarget.set(null);
  }

  protected clearSelection(): void {
    this.selected.set([]);
    this.mergeTarget.set(null);
  }

  protected startMerge(): void {
    const cards = [...this.selectedCards()].sort((a, b) => b.entity.chapters.length - a.entity.chapters.length);
    this.mergeTarget.set(cards[0]?.key ?? null);
  }

  protected setMergeTarget(event: Event): void {
    this.mergeTarget.set((event.target as HTMLSelectElement).value);
  }

  protected applyMerge(): void {
    const target = this.mergeTarget();
    if (!target) return;
    const sources = this.selectedCards().map((card) => card.key);
    this.edits.update((edits) => mergeEntities(edits, sources, target));
    this.expanded.update((keys) => new Set([...keys, target]));
    this.clearSelection();
  }

  protected deleteSelected(): void {
    for (const card of this.selectedCards()) this.deleteEntity(card.key);
    this.clearSelection();
  }

  protected startSplit(entity: WorldEditEntity): void {
    this.split.set({
      entityId: entity.id,
      name: '',
      type: entity.type === 'unknown' ? this.types()[0] : entity.type,
      aliases: [],
      facts: [],
    });
    this.expanded.update((keys) => new Set([...keys, entity.id]));
  }

  protected splitFacts(entityId: string): WorldFact[] {
    return this.current().facts.filter((fact) => touchesEntity(fact, entityId));
  }

  protected updateSplit(patch: Partial<SplitForm>): void {
    this.split.update((form) => (form ? { ...form, ...patch } : form));
  }

  protected splitText(field: 'name' | 'type', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.updateSplit(field === 'name' ? { name: value } : { type: value as EntityType });
  }

  protected splitAlias(alias: string, on: boolean): void {
    this.updateSplit({ aliases: toggled(this.split()?.aliases ?? [], alias, on) });
  }

  protected splitFact(fact: WorldFact, on: boolean): void {
    this.updateSplit({ facts: toggled(this.split()?.facts ?? [], this.target(fact), on) });
  }

  protected splitHas(fact: WorldFact): boolean {
    return (this.split()?.facts ?? []).some((ref) => sameJson(ref, this.target(fact)));
  }

  protected applySplit(): void {
    const form = this.split();
    if (!form?.name.trim()) return;
    const newEntity: WorldEditEntity = {
      id: crypto.randomUUID(),
      type: form.type,
      name: form.name.trim(),
      aliases: [],
      titles: [],
      chapters: [],
    };
    this.edits.update((edits) => [
      ...edits,
      { kind: 'entity-split', entityId: form.entityId, newEntity, aliases: form.aliases, facts: form.facts },
    ]);
    this.expanded.update((keys) => new Set([...keys, newEntity.id]));
    this.split.set(null);
  }

  protected addEntity(): void {
    const entity: WorldEditEntity = {
      id: crypto.randomUUID(),
      type: this.types()[0] ?? 'Character',
      name: '',
      aliases: [],
      titles: [],
      chapters: this.issue()?.chapters ?? [],
    };
    this.edits.update((edits) => [...edits, { kind: 'entity-add', entity }]);
    this.expanded.update((keys) => new Set([...keys, entity.id]));
  }

  protected addFact(): void {
    const entities = this.current().entities;
    const fact: WorldFact = {
      id: crypto.randomUUID(),
      chapterIndex: this.issue()?.chapters[0] ?? entities[0]?.chapters[0] ?? 1,
      kind: 'relationship',
      predicate: this.ontology()?.predicates.find((item) => item.kind === 'relationship')?.name ?? '',
      subjectId: entities[0]?.id ?? '',
      objectId: entities[1]?.id ?? entities[0]?.id ?? '',
      quote: '',
    };
    this.edits.update((edits) => [...edits, { kind: 'fact-add', fact }]);
    this.expanded.update((keys) => new Set([...keys, fact.id]));
  }

  protected close(): void {
    this.closed.emit();
  }

  protected confirm(): void {
    if (this.canConfirm()) this.confirmed.emit(this.edits());
  }

  protected issueText(issue: WorldIssue): string {
    const names = issue.entityIds.map((id) => this.entityName(id, id)).join(', ');
    return `${this.i18n.t(reasonKeys[issue.reason])} · ${names}`;
  }

  protected factText(fact: WorldFact | undefined): string {
    if (!fact) return '';
    const object = fact.kind === 'relationship' ? ` ${this.entityName(fact.objectId, fact.objectName)}` : '';
    return `${this.entityName(fact.subjectId, fact.subjectName)} ${fact.predicate}${object}`;
  }

  private target(fact: WorldFact): FactRef {
    return { factId: fact.id, chapterIndex: fact.chapterIndex };
  }

  private findEntity(id: string | undefined): WorldEditEntity | undefined {
    return (
      this.current().entities.find((entity) => entity.id === id) ??
      this.scope()?.catalog.find((entity) => entity.id === id)
    );
  }

  private withTypeLabel(params: Record<string, string>): Record<string, string> {
    return params['type'] ? { ...params, type: this.typeLabel(params['type']) } : params;
  }

  private reset(scope: WorldEditScope | null): void {
    this.edits.set([]);
    this.selected.set([]);
    this.mergeTarget.set(null);
    this.split.set(null);
    this.changesOpen.set(false);
    const ref = scope?.issue?.fact;
    const issueKeys = ref
      ? [factKey({ id: ref.factId, chapterIndex: ref.chapterIndex })]
      : (scope?.issue?.entityIds ?? []);
    this.expanded.set(new Set([...issueKeys, ...(scope?.focus ?? [])]));
  }

  private entityState(original: WorldEditEntity, now: WorldEditEntity | undefined): ItemState {
    const edits = this.edits();
    if (creatorOf(edits, original.id)) return 'new';
    if (now) return sameJson(now, original) ? 'same' : 'edited';
    if (edits.some((edit) => edit.kind === 'entity-merge' && edit.sourceIds.includes(original.id))) return 'merged';
    return edits.some((edit) => edit.kind === 'entity-delete' && edit.entityId === original.id) ? 'deleted' : 'removed';
  }

  private factState(original: WorldFact, now: WorldFact | undefined): ItemState {
    if (now) return sameJson(now, original) ? 'same' : 'edited';
    const own = this.edits().some(
      (edit) =>
        edit.kind === 'fact-delete' && edit.factId === original.id && edit.chapterIndex === original.chapterIndex,
    );
    return own ? 'deleted' : 'removed';
  }

  private fieldText(field: string, value: unknown): string {
    const label = this.i18n.t(FIELD_KEYS[field] ?? field);
    if (field === 'subjectId' || field === 'objectId')
      return `${label} → ${this.entityName(String(value), String(value))}`;
    if (field === 'type') return `${label} → ${this.typeLabel(String(value))}`;
    if (Array.isArray(value)) return `${label} → ${value.join(', ') || '∅'}`;
    return `${label} → ${String(value) || '∅'}`;
  }

  private describe(edit: WorldDraftEdit): string {
    const name = (id: string): string =>
      this.base().entities.find((entity) => entity.id === id)?.name ?? this.entityName(id, id);
    const fields = (patch: object): string =>
      Object.entries(patch)
        .map(([field, value]) => this.fieldText(field, value))
        .join(', ');
    const baseFact = (factId: string, chapterIndex: number): WorldFact | undefined =>
      this.base().facts.find((fact) => fact.id === factId && fact.chapterIndex === chapterIndex);
    switch (edit.kind) {
      case 'entity-add':
        return this.i18n.t('analysis.edit.change.entityAdd', { entity: this.entityLabel(edit.entity) });
      case 'entity-edit':
        return this.i18n.t('analysis.edit.change.entityEdit', {
          name: name(edit.entityId),
          fields: fields(edit.patch),
        });
      case 'entity-delete':
        return this.i18n.t('analysis.edit.change.entityDelete', { name: name(edit.entityId) });
      case 'entity-merge':
        return this.i18n.t('analysis.edit.change.entityMerge', {
          sources: edit.sourceIds.map(name).join(', '),
          target: name(edit.targetId),
        });
      case 'entity-split':
        return this.i18n.t('analysis.edit.change.entitySplit', {
          entity: this.entityLabel(edit.newEntity),
          name: name(edit.entityId),
          aliases: edit.aliases.length,
          facts: edit.facts.length,
        });
      case 'fact-add':
        return this.i18n.t('analysis.edit.change.factAdd', { fact: this.factText(edit.fact) });
      case 'fact-edit':
        return this.i18n.t('analysis.edit.change.factEdit', {
          fact: this.factText(baseFact(edit.factId, edit.chapterIndex)),
          fields: fields(edit.patch),
        });
      case 'fact-delete':
        return this.i18n.t('analysis.edit.change.factDelete', {
          fact: this.factText(baseFact(edit.factId, edit.chapterIndex)),
        });
    }
  }
}
