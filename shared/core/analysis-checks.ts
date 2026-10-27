import type { AnalysisEntity, AnalysisFact, CandidateOutput, ChapterAnalysisCounts } from '../models/analysis';
import type { EntityType } from '../models/analysis';
import type { FailReason, Ontology, OntologyPredicate, PredicateOutput } from '../models/analysis';
import { HAS_PERSONA, propertyTypes } from './ontology-rules';
import { findTextContext, findTextMatches } from './text-match';

export interface CandidateChapter {
  index: number;
  paragraphs: string[];
}

export function nameKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

function namesInChapter(chapter: CandidateChapter, names: string[]): string[] {
  return names.filter((name) =>
    chapter.paragraphs.some((paragraph) => findTextMatches(paragraph, name, { fold: true }).length > 0),
  );
}

export function checkEntity(
  chapter: CandidateChapter,
  entity: AnalysisEntity,
  ontology: Ontology,
): { wordsFound: string[]; reason?: FailReason } {
  const wordsFound: string[] = namesInChapter(chapter, [entity.name, ...entity.aliases]);
  if (!ontology.entityTypes.includes(entity.type as EntityType))
    return { wordsFound, reason: 'entity-not-in-ontology' };
  if (wordsFound.length === 0) return { wordsFound, reason: 'words-not-found' };
  return { wordsFound };
}

export function mergeWords(words: string[], added: string[], name: string = ''): string[] {
  const merged: string[] = [...words];
  for (const raw of added) {
    const word = raw.trim();
    if (word && nameKey(word) !== nameKey(name) && !merged.some((existing) => nameKey(existing) === nameKey(word)))
      merged.push(word);
  }
  return merged;
}

export function checkCandidates(input: {
  chapters: CandidateChapter[];
  output: CandidateOutput;
  ontology: Ontology;
  stage: EntityType | 'all';
}): { entities: Map<number, AnalysisEntity[]>; errors: string[] } {
  const entities = new Map<number, AnalysisEntity[]>(input.chapters.map((chapter) => [chapter.index, []]));
  const errors: string[] = [];
  const unique = new Map<string, { type: string; name: string; aliases: string[]; titles: string[] }>();
  const withAliases: EntityType[] = propertyTypes(input.ontology, 'alias');
  const withTitles: EntityType[] = propertyTypes(input.ontology, 'title');
  for (const candidate of input.output.entities) {
    const name = candidate.name.trim();
    if (!name) continue;
    const id = `${candidate.type}:${nameKey(name)}`;
    let merged = unique.get(id);
    if (!merged) {
      merged = { type: candidate.type, name, aliases: [], titles: [] };
      unique.set(id, merged);
    }
    if (withAliases.includes(candidate.type as EntityType))
      merged.aliases = mergeWords(merged.aliases, candidate.aliases, merged.name);
    if (withTitles.includes(candidate.type as EntityType))
      merged.titles = mergeWords(merged.titles, candidate.titles ?? []);
  }
  const first = input.chapters[0];
  if (!first) return { entities, errors };
  for (const candidate of unique.values()) {
    const typeAllowed =
      input.ontology.entityTypes.includes(candidate.type as EntityType) &&
      (input.stage === 'all' || candidate.type === input.stage);
    const id = `${candidate.type}:${nameKey(candidate.name)}`;
    const names = [candidate.name, ...candidate.aliases];
    const matches = input.chapters.map((chapter) => ({ chapter, wordsFound: namesInChapter(chapter, names) }));
    const destinations = typeAllowed ? matches.filter((match) => match.wordsFound.length > 0) : [];
    if (destinations.length === 0) {
      const reason: FailReason = typeAllowed ? 'words-not-found' : 'entity-not-in-ontology';
      const wordsFound = typeAllowed ? [] : namesInChapter(first, names);
      entities.get(first.index)!.push({
        id,
        type: candidate.type as AnalysisEntity['type'],
        name: candidate.name,
        aliases: candidate.aliases,
        ...(candidate.titles.length ? { titles: candidate.titles } : {}),
        wordsFound,
        status: 'failed',
        reason,
      });
      errors.push(
        typeAllowed
          ? `Entity "${candidate.name}" (${candidate.type}): the name or aliases are not in the chapter text.`
          : `Entity "${candidate.name}": type "${candidate.type}" is not allowed; use one of: ${input.stage === 'all' ? input.ontology.entityTypes.join(', ') : input.stage}.`,
      );
      continue;
    }
    for (const { chapter, wordsFound } of destinations)
      entities.get(chapter.index)!.push({
        id,
        type: candidate.type as AnalysisEntity['type'],
        name: candidate.name,
        aliases: candidate.aliases,
        ...(candidate.titles.length ? { titles: candidate.titles } : {}),
        wordsFound,
        status: 'verified',
      });
  }
  return { entities, errors: [...errors, ...personaErrors([...unique.values()], input.ontology, input.stage)] };
}

function personaErrors(
  candidates: { type: string; name: string }[],
  ontology: Ontology,
  stage: EntityType | 'all',
): string[] {
  if (stage !== 'all' || !ontology.entityTypes.includes('Persona')) return [];
  const personas: Set<string> = new Set<string>(
    candidates.filter((candidate) => candidate.type === 'Persona').map((candidate) => nameKey(candidate.name)),
  );
  return candidates
    .filter((candidate) => candidate.type === 'Character' && !personas.has(nameKey(candidate.name)))
    .map(
      (candidate) =>
        `Entity "${candidate.name}" (Character): add a Persona with the same name; attributes and relations belong to the Persona.`,
    );
}

function resolveEntity(
  name: string,
  entities: AnalysisEntity[],
  types: readonly EntityType[] = [],
): AnalysisEntity | undefined {
  const normalized = nameKey(name.trim());
  if (!normalized) return undefined;
  const matches = entities.filter(
    (entity) =>
      entity.status !== 'rejected' && [entity.name, ...entity.aliases].some((word) => nameKey(word) === normalized),
  );
  return matches.find((entity) => types.includes(entity.type as EntityType)) ?? matches[0];
}

function typeProblem(
  predicate: OntologyPredicate,
  subject: AnalysisEntity,
  object: AnalysisEntity | undefined,
): string | undefined {
  if (!predicate.subjectTypes.includes(subject.type as EntityType))
    return `"${subject.name}" is a ${subject.type}; ${predicate.name} subjects must be: ${predicate.subjectTypes.join(', ')}.`;
  if (object && !predicate.objectTypes?.includes(object.type as EntityType))
    return `"${object.name}" is a ${object.type}; ${predicate.name} objects must be: ${predicate.objectTypes?.join(', ')}.`;
  return undefined;
}

function factError(fact: AnalysisFact, reason: FailReason, ontology: Ontology, typeDetail?: string): string {
  const label = `Fact "${fact.subjectName ?? fact.subjectId} / ${fact.predicate}"`;
  if (reason === 'entity-not-found') return `${label}: the subject or object is not a known entity.`;
  if (reason === 'predicate-not-in-ontology')
    return `${label}: predicate is not allowed; use one of: ${ontology.predicates
      .map((item) => item.name)
      .join(', ')}.`;
  if (reason === 'type-not-allowed') return `${label}: ${typeDetail}`;
  if (reason === 'label-missing') return `${label}: this predicate needs a label that names the relation.`;
  return `${label}: the quote is not in the chapter text.`;
}

export function checkFact(
  chapter: CandidateChapter,
  entities: AnalysisEntity[],
  fact: AnalysisFact,
  ontology: Ontology,
): FailReason | undefined {
  const predicate: OntologyPredicate | undefined = ontology.predicates.find(
    (item: OntologyPredicate): boolean => nameKey(item.name) === nameKey(fact.predicate),
  );
  const find = (id: string | undefined): AnalysisEntity | undefined =>
    entities.find((entity: AnalysisEntity): boolean => entity.id === id && entity.status !== 'rejected');
  const subject: AnalysisEntity | undefined = find(fact.subjectId);
  const object: AnalysisEntity | undefined = find(fact.objectId);
  const quote: string = fact.quote?.trim() ?? '';
  if (!subject || (fact.kind === 'relationship' && !object)) return 'entity-not-found';
  if (!predicate) return 'predicate-not-in-ontology';
  if (typeProblem(predicate, subject, object)) return 'type-not-allowed';
  if (predicate.labeled && !fact.label?.trim()) return 'label-missing';
  if (!quote || findTextContext(chapter.paragraphs, quote, { fold: true }) === null) return 'quote-not-found';
  return undefined;
}

export function checkPredicates(input: {
  chapter: CandidateChapter;
  entities: AnalysisEntity[];
  output: PredicateOutput;
  ontology: Ontology;
}): { facts: AnalysisFact[]; errors: string[] } {
  const facts: AnalysisFact[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const predicates: OntologyPredicate[] = input.ontology.predicates;
  for (const raw of input.output.facts) {
    const predicateName = raw.predicate.trim();
    const predicate: OntologyPredicate | undefined = predicates.find(
      (item) => nameKey(item.name) === nameKey(predicateName),
    );
    let subject = resolveEntity(raw.subject, input.entities, predicate?.subjectTypes);
    let object =
      predicate?.kind === 'scalar'
        ? undefined
        : resolveEntity(raw.object ?? '', input.entities, predicate?.objectTypes);
    if (predicate?.symmetric && subject && object && object.id < subject.id) [subject, object] = [object, subject];
    const kind: AnalysisFact['kind'] = predicate?.kind ?? (raw.object !== null ? 'relationship' : 'scalar');
    const label = predicate?.labeled ? (raw.label?.trim() ?? '') : '';
    const quote = raw.quote.trim();
    const fact: AnalysisFact = {
      id: `f-${facts.length + 1}`,
      kind,
      predicate: predicate?.name ?? predicateName,
      subjectId: subject?.id ?? '',
      ...(kind === 'relationship' && object ? { objectId: object.id } : {}),
      subjectName: subject?.name ?? raw.subject,
      ...(kind === 'relationship' ? { objectName: object?.name ?? raw.object ?? '' } : {}),
      ...(label ? { label } : {}),
      quote,
      status: 'verified',
    };
    const duplicateKey = JSON.stringify([
      nameKey(fact.predicate),
      nameKey(subject?.id ?? raw.subject),
      kind === 'relationship' ? nameKey(object?.id ?? raw.object ?? '') : nameKey(quote),
      nameKey(label),
    ]);
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    const typeDetail = predicate && subject ? typeProblem(predicate, subject, object) : undefined;
    const reason: FailReason | undefined = checkFact(input.chapter, input.entities, fact, input.ontology);
    if (reason) {
      fact.status = 'failed';
      fact.reason = reason;
      errors.push(factError(fact, reason, input.ontology, typeDetail));
    }
    facts.push(fact);
  }
  return { facts, errors };
}

export function mergeStageEntities(
  previous: AnalysisEntity[],
  next: AnalysisEntity[],
  stage: EntityType | 'all',
): AnalysisEntity[] {
  return stage === 'all' ? next : [...previous.filter((entity) => entity.type !== stage), ...next];
}

export function chapterCounts(entities: AnalysisEntity[], facts: AnalysisFact[]): ChapterAnalysisCounts {
  const items: (AnalysisEntity | AnalysisFact)[] = [...entities, ...facts];
  return {
    entities: entities.length,
    facts: facts.length,
    verified: items.filter((item) => item.status === 'verified').length,
    failed: items.filter((item) => item.status === 'failed').length,
    accepted: items.filter((item) => item.status === 'accepted').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
  };
}

export function hasIssues(counts: ChapterAnalysisCounts): boolean {
  return counts.failed > 0;
}

type CheckedItems = { entities: AnalysisEntity[]; facts: AnalysisFact[] };

const CONFLICTS: readonly FailReason[] = ['name-conflict', 'alias-conflict'];

function takesPartInConflicts(item: AnalysisEntity | AnalysisFact): boolean {
  return (
    item.status === 'verified' ||
    item.status === 'accepted' ||
    (item.status === 'failed' && item.reason !== undefined && CONFLICTS.includes(item.reason))
  );
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): T[][] {
  const groups: Map<string, T[]> = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return [...groups.values()];
}

function isPersonaPair(types: Set<string>, ontology: Ontology): boolean {
  const predicate: OntologyPredicate | undefined = ontology.predicates.find(
    (item: OntologyPredicate): boolean => item.name === HAS_PERSONA,
  );
  const pair: string[] = [...(predicate?.subjectTypes ?? []), ...(predicate?.objectTypes ?? [])];
  return pair.length === 2 && types.size === 2 && pair.every((type: string): boolean => types.has(type));
}

function nameConflicts(entities: AnalysisEntity[], ontology: Ontology): Set<string> {
  const ids: Set<string> = new Set<string>();
  for (const group of groupBy(entities, (entity: AnalysisEntity): string => nameKey(entity.name))) {
    const types: Set<string> = new Set<string>(group.map((entity: AnalysisEntity): string => entity.type));
    if (types.size > 1 && !isPersonaPair(types, ontology))
      group.forEach((entity: AnalysisEntity): void => void ids.add(entity.id));
  }
  return ids;
}

export function clashingAliases(entity: AnalysisEntity, names: Set<string>): string[] {
  return entity.aliases.filter(
    (alias: string): boolean => nameKey(alias) !== nameKey(entity.name) && names.has(nameKey(alias)),
  );
}

function aliasConflicts(entities: AnalysisEntity[]): Set<string> {
  const names: Set<string> = new Set<string>(entities.map((entity: AnalysisEntity): string => nameKey(entity.name)));
  return new Set<string>(
    entities
      .filter((entity: AnalysisEntity): boolean => clashingAliases(entity, names).length > 0)
      .map((entity: AnalysisEntity): string => entity.id),
  );
}

function isKeptConflict(item: AnalysisEntity | AnalysisFact): boolean {
  return item.status === 'accepted' && item.issue !== undefined && CONFLICTS.includes(item.issue);
}

function applyConflict<T extends AnalysisEntity | AnalysisFact>(item: T, conflict: FailReason | undefined): T {
  if (!takesPartInConflicts(item) || isKeptConflict(item)) return { ...item };
  if (conflict) return { ...item, status: 'failed', reason: conflict };
  if (item.status !== 'failed') return { ...item };
  const verified: T = { ...item, status: 'verified' };
  delete verified.reason;
  return verified;
}

export function checkConflicts(input: {
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
  ontology: Ontology;
}): CheckedItems {
  const entities: AnalysisEntity[] = input.entities.filter(takesPartInConflicts);
  const nameIds: Set<string> = nameConflicts(entities, input.ontology);
  const aliasIds: Set<string> = aliasConflicts(entities);
  return {
    entities: input.entities.map((entity: AnalysisEntity): AnalysisEntity =>
      applyConflict(
        entity,
        nameIds.has(entity.id) ? 'name-conflict' : aliasIds.has(entity.id) ? 'alias-conflict' : undefined,
      ),
    ),
    facts: input.facts.map((fact: AnalysisFact): AnalysisFact => ({ ...fact })),
  };
}

function withIssue<T extends AnalysisEntity | AnalysisFact>(item: T): T {
  return item.status === 'failed' && item.reason && !item.issue ? { ...item, issue: item.reason } : item;
}

export function checkChapter(input: {
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
  ontology: Ontology;
}): CheckedItems {
  const checked: CheckedItems = checkConflicts(input);
  return { entities: checked.entities.map(withIssue), facts: checked.facts.map(withIssue) };
}

function tagged<I extends AnalysisEntity | AnalysisFact>(index: number, items: I[]): I[] {
  return items.map((item: I): I => ({ ...item, id: `${index}|${item.id}` }));
}

function untagged<I extends AnalysisEntity | AnalysisFact>(items: I[]): Map<number, I[]> {
  const chapters: Map<number, I[]> = new Map<number, I[]>();
  for (const item of items) {
    const at: number = item.id.indexOf('|');
    const index: number = Number(item.id.slice(0, at));
    if (!chapters.has(index)) chapters.set(index, []);
    chapters.get(index)!.push({ ...item, id: item.id.slice(at + 1) });
  }
  return chapters;
}

export function checkWorld<T extends { index: number } & CheckedItems>(chapters: T[], ontology: Ontology): T[] {
  const checked: CheckedItems = checkChapter({
    entities: chapters.flatMap((chapter: T): AnalysisEntity[] => tagged(chapter.index, chapter.entities)),
    facts: chapters.flatMap((chapter: T): AnalysisFact[] => tagged(chapter.index, chapter.facts)),
    ontology,
  });
  const entities: Map<number, AnalysisEntity[]> = untagged(checked.entities);
  const facts: Map<number, AnalysisFact[]> = untagged(checked.facts);
  return chapters.map((chapter: T): T => ({
    ...chapter,
    entities: entities.get(chapter.index) ?? [],
    facts: facts.get(chapter.index) ?? [],
  }));
}
