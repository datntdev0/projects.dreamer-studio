import type { AnalysisEntity, AnalysisFact, CandidateOutput, ChapterAnalysisCounts } from '../models/analysis';
import type { EntityType } from '../models/analysis';
import type { FailReason, Ontology, OntologyPredicate, PredicateOutput } from '../models/analysis';
import { aliasTypes, factPredicates } from './ontology';
import { findTextContext, findTextMatches } from './text-match';

interface CandidateChapter {
  index: number;
  paragraphs: string[];
}

function key(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

function namesInChapter(chapter: CandidateChapter, names: string[]): string[] {
  return names.filter((name) => chapter.paragraphs.some((paragraph) => findTextMatches(paragraph, name).length > 0));
}

export function checkCandidates(input: {
  chapters: CandidateChapter[];
  output: CandidateOutput;
  ontology: Ontology;
  stage: EntityType | 'all';
}): { entities: Map<number, AnalysisEntity[]>; errors: string[] } {
  const entities = new Map<number, AnalysisEntity[]>(input.chapters.map((chapter) => [chapter.index, []]));
  const errors: string[] = [];
  const unique = new Map<string, { type: string; name: string; aliases: string[] }>();
  const withAliases: EntityType[] = aliasTypes(input.ontology);
  for (const candidate of input.output.entities) {
    const name = candidate.name.trim();
    if (!name) continue;
    const id = `${candidate.type}:${key(name)}`;
    let merged = unique.get(id);
    if (!merged) {
      merged = { type: candidate.type, name, aliases: [] };
      unique.set(id, merged);
    }
    if (!withAliases.includes(candidate.type as EntityType)) continue;
    for (const rawAlias of candidate.aliases) {
      const alias = rawAlias.trim();
      if (alias && key(alias) !== key(merged.name) && !merged.aliases.some((existing) => key(existing) === key(alias)))
        merged.aliases.push(alias);
    }
  }
  const first = input.chapters[0];
  if (!first) return { entities, errors };
  for (const candidate of unique.values()) {
    const typeAllowed =
      input.ontology.entityTypes.includes(candidate.type as EntityType) &&
      (input.stage === 'all' || candidate.type === input.stage);
    const id = `${candidate.type}:${key(candidate.name)}`;
    const names = [candidate.name, ...candidate.aliases];
    const matches = input.chapters.map((chapter) => ({ chapter, wordsFound: namesInChapter(chapter, names) }));
    const destinations = typeAllowed ? matches.filter((match) => match.wordsFound.length > 0) : [];
    if (destinations.length === 0) {
      const reason: FailReason = typeAllowed ? 'words-not-found' : 'type-not-in-ontology';
      const wordsFound = typeAllowed ? [] : namesInChapter(first, names);
      entities.get(first.index)!.push({
        id,
        type: candidate.type as AnalysisEntity['type'],
        name: candidate.name,
        aliases: candidate.aliases,
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
        wordsFound,
        status: 'verified',
      });
  }
  return { entities, errors };
}

function resolveEntity(
  name: string,
  entities: AnalysisEntity[],
  types: readonly EntityType[] = [],
): AnalysisEntity | undefined {
  const normalized = key(name.trim());
  if (!normalized) return undefined;
  const matches = entities.filter(
    (entity) =>
      entity.status !== 'rejected' && [entity.name, ...entity.aliases].some((word) => key(word) === normalized),
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
    return `${label}: predicate is not allowed; use one of: ${factPredicates(ontology)
      .map((item) => item.name)
      .join(', ')}.`;
  if (reason === 'type-not-allowed') return `${label}: ${typeDetail}`;
  if (reason === 'value-not-allowed') return `${label}: the value is missing or not allowed.`;
  if (reason === 'label-missing') return `${label}: this predicate needs a label that names the relation.`;
  return `${label}: the quote is not in the chapter text.`;
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
  const predicates: OntologyPredicate[] = factPredicates(input.ontology);
  for (const raw of input.output.facts) {
    const predicateName = raw.predicate.trim();
    const predicate: OntologyPredicate | undefined = predicates.find((item) => key(item.name) === key(predicateName));
    let subject = resolveEntity(raw.subject, input.entities, predicate?.subjectTypes);
    let object =
      predicate?.kind === 'scalar'
        ? undefined
        : resolveEntity(raw.object ?? '', input.entities, predicate?.objectTypes);
    if (predicate?.symmetric && subject && object && object.id < subject.id) [subject, object] = [object, subject];
    const kind: AnalysisFact['kind'] = predicate?.kind ?? (raw.object !== null ? 'relationship' : 'scalar');
    const value = raw.value?.trim() ?? '';
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
      ...(kind === 'scalar' ? { value } : {}),
      ...(label ? { label } : {}),
      quote,
      status: 'verified',
    };
    const duplicateKey = JSON.stringify([
      key(fact.predicate),
      key(subject?.id ?? raw.subject),
      kind === 'relationship' ? key(object?.id ?? raw.object ?? '') : key(value),
      key(label),
    ]);
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    const typeDetail = predicate && subject ? typeProblem(predicate, subject, object) : undefined;
    let reason: FailReason | undefined;
    if (!subject || (kind === 'relationship' && !object)) reason = 'entity-not-found';
    else if (!predicate) reason = 'predicate-not-in-ontology';
    else if (typeDetail) reason = 'type-not-allowed';
    else if (
      kind === 'scalar' &&
      (!value || (predicate.allowedValues && !predicate.allowedValues.some((allowed) => key(allowed) === key(value))))
    )
      reason = 'value-not-allowed';
    else if (predicate.labeled && !label) reason = 'label-missing';
    else if (!quote || findTextContext(input.chapter.paragraphs, quote) === null) reason = 'quote-not-found';
    if (kind === 'scalar' && value && predicate?.allowedValues) {
      fact.value = predicate.allowedValues.find((allowed) => key(allowed) === key(value)) ?? value;
    }
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
