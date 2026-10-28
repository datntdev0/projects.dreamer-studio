import type { EntityPatch, FactPatch, FactRef, WorldDraftEdit, WorldEditEntity, WorldFact } from '../models/analysis';
import { mergeWords } from './analysis-checks';

export interface DraftState {
  entities: WorldEditEntity[];
  facts: WorldFact[];
}

type FactTarget = { factId: string; chapterIndex: number };

export function factKey(fact: { id: string; chapterIndex: number }): string {
  return `${fact.chapterIndex}:${fact.id}`;
}

function isFact(fact: WorldFact, target: FactTarget): boolean {
  return fact.id === target.factId && fact.chapterIndex === target.chapterIndex;
}

function isRef(fact: WorldFact, refs: FactRef[]): boolean {
  return refs.some((ref) => isFact(fact, ref));
}

export function touchesEntity(fact: WorldFact, entityId: string): boolean {
  return fact.subjectId === entityId || fact.objectId === entityId;
}

function relink(fact: WorldFact, from: string, to: string): WorldFact {
  return {
    ...fact,
    subjectId: fact.subjectId === from ? to : fact.subjectId,
    ...(fact.objectId === from ? { objectId: to } : {}),
  };
}

function applyMerge(state: DraftState, edit: Extract<WorldDraftEdit, { kind: 'entity-merge' }>): DraftState {
  const target = state.entities.find((entity) => entity.id === edit.targetId);
  if (!target) return state;
  let { entities, facts } = state;
  for (const sourceId of edit.sourceIds.filter((id) => id !== target.id)) {
    const source = entities.find((entity) => entity.id === sourceId);
    if (!source) continue;
    target.aliases = mergeWords(target.aliases, [source.name, ...source.aliases], target.name);
    target.titles = mergeWords(target.titles, source.titles);
    target.chapters = [...new Set([...target.chapters, ...source.chapters])].sort((a, b) => a - b);
    entities = entities.filter((entity) => entity.id !== sourceId);
    facts = facts.map((fact) => relink(fact, sourceId, target.id));
  }
  return { entities, facts };
}

function applySplit(state: DraftState, edit: Extract<WorldDraftEdit, { kind: 'entity-split' }>): DraftState {
  const entity = state.entities.find((item) => item.id === edit.entityId);
  if (!entity) return state;
  entity.aliases = entity.aliases.filter((alias) => !edit.aliases.includes(alias));
  const facts = state.facts.map((fact) =>
    isRef(fact, edit.facts) ? relink(fact, entity.id, edit.newEntity.id) : fact,
  );
  const chapters = [...new Set(edit.facts.map((ref) => ref.chapterIndex))].sort((a, b) => a - b);
  const created: WorldEditEntity = {
    ...edit.newEntity,
    aliases: [...edit.newEntity.aliases, ...edit.aliases],
    chapters: chapters.length ? chapters : [...entity.chapters],
  };
  return { entities: [...state.entities, created], facts };
}

export function applyDraftEdits(base: DraftState, edits: WorldDraftEdit[]): DraftState {
  let state: DraftState = {
    entities: base.entities.map((entity) => ({ ...entity, aliases: [...entity.aliases], titles: [...entity.titles] })),
    facts: base.facts.map((fact) => ({ ...fact })),
  };
  for (const edit of edits) {
    if (edit.kind === 'entity-add') state.entities.push({ ...edit.entity });
    else if (edit.kind === 'entity-edit')
      state.entities = state.entities.map((entity) =>
        entity.id === edit.entityId ? { ...entity, ...edit.patch } : entity,
      );
    else if (edit.kind === 'entity-delete')
      state = {
        entities: state.entities.filter((entity) => entity.id !== edit.entityId),
        facts: state.facts.filter((fact) => !touchesEntity(fact, edit.entityId)),
      };
    else if (edit.kind === 'entity-merge') state = applyMerge(state, edit);
    else if (edit.kind === 'entity-split') state = applySplit(state, edit);
    else if (edit.kind === 'fact-add') state.facts.push({ ...edit.fact });
    else if (edit.kind === 'fact-edit')
      state.facts = state.facts.map((fact) => (isFact(fact, edit) ? { ...fact, ...edit.patch } : fact));
    else state.facts = state.facts.filter((fact) => !isFact(fact, edit));
  }
  return state;
}

function trimPatch<T extends object>(patch: Partial<T>, original: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([field, value]) => JSON.stringify(value) !== JSON.stringify(original[field as keyof T]),
    ),
  ) as Partial<T>;
}

function replaceOrAppend(
  edits: WorldDraftEdit[],
  prior: WorldDraftEdit | undefined,
  next: WorldDraftEdit | null,
): WorldDraftEdit[] {
  if (!prior) return next ? [...edits, next] : edits;
  return next ? edits.map((edit) => (edit === prior ? next : edit)) : edits.filter((edit) => edit !== prior);
}

export function creatorOf(edits: WorldDraftEdit[], entityId: string): WorldDraftEdit | undefined {
  return edits.find(
    (edit) =>
      (edit.kind === 'entity-add' && edit.entity.id === entityId) ||
      (edit.kind === 'entity-split' && edit.newEntity.id === entityId),
  );
}

export function addedFact(
  edits: WorldDraftEdit[],
  factId: string,
): Extract<WorldDraftEdit, { kind: 'fact-add' }> | undefined {
  const edit = edits.find((item) => item.kind === 'fact-add' && item.fact.id === factId);
  return edit?.kind === 'fact-add' ? edit : undefined;
}

export function patchEntity(
  edits: WorldDraftEdit[],
  base: DraftState,
  entityId: string,
  patch: EntityPatch,
): WorldDraftEdit[] {
  const creator = creatorOf(edits, entityId);
  if (creator?.kind === 'entity-add')
    return replaceOrAppend(edits, creator, { ...creator, entity: { ...creator.entity, ...patch } });
  if (creator?.kind === 'entity-split')
    return replaceOrAppend(edits, creator, { ...creator, newEntity: { ...creator.newEntity, ...patch } });
  const original = base.entities.find((entity) => entity.id === entityId);
  if (!original) return edits;
  const prior = edits.find((edit) => edit.kind === 'entity-edit' && edit.entityId === entityId);
  const merged = trimPatch({ ...(prior?.kind === 'entity-edit' ? prior.patch : {}), ...patch }, original);
  return replaceOrAppend(
    edits,
    prior,
    Object.keys(merged).length ? { kind: 'entity-edit', entityId, patch: merged } : null,
  );
}

export function patchFact(
  edits: WorldDraftEdit[],
  base: DraftState,
  target: FactTarget,
  patch: Partial<WorldFact>,
): WorldDraftEdit[] {
  const added = addedFact(edits, target.factId);
  if (added) return replaceOrAppend(edits, added, { ...added, fact: { ...added.fact, ...patch } });
  const original = base.facts.find((fact) => isFact(fact, target));
  if (!original) return edits;
  const prior = edits.find((edit) => edit.kind === 'fact-edit' && isFact(original, edit));
  const merged = trimPatch<FactPatch>({ ...(prior?.kind === 'fact-edit' ? prior.patch : {}), ...patch }, original);
  return replaceOrAppend(
    edits,
    prior,
    Object.keys(merged).length ? { kind: 'fact-edit', ...target, patch: merged } : null,
  );
}

function withoutReferences(edits: WorldDraftEdit[], entityId: string): WorldDraftEdit[] {
  return edits.flatMap((edit): WorldDraftEdit[] => {
    if (edit.kind === 'fact-add' && touchesEntity(edit.fact, entityId)) return [];
    if ('entityId' in edit && edit.entityId === entityId) return [];
    if (edit.kind === 'entity-merge' && (edit.targetId === entityId || edit.sourceIds.includes(entityId))) return [];
    if (edit.kind !== 'fact-edit') return [edit];
    const patch: FactPatch = { ...edit.patch };
    if (patch.subjectId === entityId) delete patch.subjectId;
    if (patch.objectId === entityId) delete patch.objectId;
    return Object.keys(patch).length ? [{ ...edit, patch }] : [];
  });
}

export function removeEntity(edits: WorldDraftEdit[], entityId: string): WorldDraftEdit[] {
  const creator = creatorOf(edits, entityId);
  if (creator)
    return withoutReferences(
      edits.filter((edit) => edit !== creator),
      entityId,
    );
  return [
    ...edits.filter((edit) => !(edit.kind === 'entity-edit' && edit.entityId === entityId)),
    { kind: 'entity-delete', entityId },
  ];
}

export function removeFact(edits: WorldDraftEdit[], target: FactTarget): WorldDraftEdit[] {
  const added = addedFact(edits, target.factId);
  if (added) return edits.filter((edit) => edit !== added);
  const rest = edits.filter(
    (edit) =>
      !(edit.kind === 'fact-edit' && edit.factId === target.factId && edit.chapterIndex === target.chapterIndex),
  );
  return [...rest, { kind: 'fact-delete', ...target }];
}

export function mergeEntities(edits: WorldDraftEdit[], sourceIds: string[], targetId: string): WorldDraftEdit[] {
  return [...edits, { kind: 'entity-merge', sourceIds: sourceIds.filter((id) => id !== targetId), targetId }];
}

export function undoDraftEdit(edits: WorldDraftEdit[], undone: WorldDraftEdit): WorldDraftEdit[] {
  if (undone.kind === 'entity-add') return removeEntity(edits, undone.entity.id);
  if (undone.kind === 'entity-split') return removeEntity(edits, undone.newEntity.id);
  return edits.filter((edit) => edit !== undone);
}
