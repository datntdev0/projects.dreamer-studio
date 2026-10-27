import { ErrorCode } from '../errors/app-error';
import type { AnalysisFact, EntityType, Ontology, OntologyPredicate, OverlayEdit, World } from '../models/analysis';
import type { WorldEntity } from '../models/analysis';
import { nameKey } from './analysis-checks';
import { findTextContext } from './text-match';
import type { OccurrenceChapter } from './world';

export interface OverlayCheckInput {
  edit: OverlayEdit;
  world: World;
  ontology: Ontology;
  chapters: OccurrenceChapter[];
}

type CheckResult = ErrorCode | null;
type FactEdit = Extract<OverlayEdit, { kind: 'fact-add' | 'fact-edit' }>;

const INVALID: CheckResult = ErrorCode.AnalysisEditInvalid;

function findEntity(world: World, id: string | undefined): WorldEntity | undefined {
  return world.entities.find((entity) => entity.id === id);
}

function currentFact(world: World, factId: string, chapterIndex: number): Partial<AnalysisFact> | null {
  const link = world.links.find((item) =>
    item.factRefs?.some((ref) => ref.factId === factId && ref.chapterIndex === chapterIndex),
  );
  if (link) {
    return {
      kind: 'relationship',
      predicate: link.predicate,
      subjectId: link.source,
      objectId: link.target,
      ...(link.label ? { label: link.label } : {}),
    };
  }
  for (const entity of world.entities) {
    const scalar = entity.scalars.find((item) => item.factId === factId && item.chapterIndex === chapterIndex);
    if (scalar) return { kind: 'scalar', predicate: scalar.predicate, subjectId: entity.id };
  }
  return null;
}

function mergedFact(input: OverlayCheckInput, edit: FactEdit): Partial<AnalysisFact> | null {
  if (edit.kind === 'fact-add') return edit.fact;
  const current = currentFact(input.world, edit.factId, edit.chapterIndex);
  return current ? { ...current, ...edit.patch } : null;
}

function typeAllowed(types: EntityType[] | undefined, entity: WorldEntity | undefined): boolean {
  return !!entity && !!types?.includes(entity.type);
}

function factShapeValid(input: OverlayCheckInput, fact: Partial<AnalysisFact>): boolean {
  const predicate: OntologyPredicate | undefined = input.ontology.predicates.find(
    (item) => nameKey(item.name) === nameKey(fact.predicate ?? ''),
  );
  if (!predicate || predicate.kind !== fact.kind) return false;
  if (!typeAllowed(predicate.subjectTypes, findEntity(input.world, fact.subjectId))) return false;
  if (fact.kind === 'relationship' && !typeAllowed(predicate.objectTypes, findEntity(input.world, fact.objectId)))
    return false;
  return !predicate.labeled || !!fact.label?.trim();
}

function checkFactEdit(input: OverlayCheckInput, edit: FactEdit): CheckResult {
  const fact = mergedFact(input, edit);
  const chapter = input.chapters.find((item) => item.index === edit.chapterIndex);
  if (!fact || !chapter || !factShapeValid(input, fact)) return INVALID;
  const quote = fact.quote?.trim() ?? '';
  if (quote && findTextContext(chapter.paragraphs, quote, { fold: true }) === null)
    return ErrorCode.AnalysisQuoteNotFound;
  return null;
}

function checkEntityEdit(input: OverlayCheckInput, edit: Exclude<OverlayEdit, FactEdit>): CheckResult {
  const { world, ontology } = input;
  const exists = (id: string): boolean => !!findEntity(world, id);
  const knownType = (type: EntityType): boolean => ontology.entityTypes.includes(type);
  let valid = true;
  if (edit.kind === 'entity-add')
    valid = knownType(edit.entity.type) && !!edit.entity.name.trim() && !exists(edit.entity.id);
  else if (edit.kind === 'entity-rename') valid = exists(edit.entityId) && !!edit.name.trim();
  else if (edit.kind === 'entity-change-type') valid = exists(edit.entityId) && knownType(edit.entityType);
  else if (edit.kind === 'entity-add-alias') valid = exists(edit.entityId) && !!edit.alias.trim();
  else if (edit.kind === 'entity-remove-alias' || edit.kind === 'entity-delete') valid = exists(edit.entityId);
  else if (edit.kind === 'entity-merge')
    valid = exists(edit.targetId) && edit.sourceIds.some((id) => id !== edit.targetId && exists(id));
  else if (edit.kind === 'entity-split')
    valid =
      exists(edit.entityId) &&
      knownType(edit.newEntity.type) &&
      !!edit.newEntity.name.trim() &&
      !exists(edit.newEntity.id);
  return valid ? null : INVALID;
}

export function checkOverlayEdit(input: OverlayCheckInput): CheckResult {
  const { edit } = input;
  if (edit.kind === 'fact-add' || edit.kind === 'fact-edit') return checkFactEdit(input, edit);
  if (edit.kind === 'entity-restore' || edit.kind === 'fact-restore') return null;
  if (edit.kind === 'fact-delete') return currentFact(input.world, edit.factId, edit.chapterIndex) ? null : INVALID;
  return checkEntityEdit(input, edit);
}
