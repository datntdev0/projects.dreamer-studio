import type { AnalysisEntity, AnalysisFact, CandidateOutput, ChapterAnalysisCounts } from '../models/analysis';
import type { EntityType } from '../models/analysis';
import type { FailReason, Ontology, OntologyPredicate, PredicateOutput } from '../models/analysis';
import { propertyTypes } from './ontology-rules';
import { findTextContext, findTextMatches } from './text-match';

export interface CandidateChapter {
  index: number;
  paragraphs: string[];
}

export function nameKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

export function namesFound(paragraphs: string[], names: string[]): string[] {
  return names.filter((name) =>
    paragraphs.some((paragraph) => findTextMatches(paragraph, name, { fold: true }).length > 0),
  );
}

export function findPredicate(ontology: Ontology, name: string): OntologyPredicate | undefined {
  return ontology.predicates.find((item) => nameKey(item.name) === nameKey(name));
}

export function typeMismatch(
  predicate: OntologyPredicate,
  subjectType: string,
  objectType: string | undefined,
): { side: 'subject' | 'object'; allowed: EntityType[] } | undefined {
  if (!predicate.subjectTypes.includes(subjectType as EntityType))
    return { side: 'subject', allowed: predicate.subjectTypes };
  if (objectType !== undefined && !predicate.objectTypes?.includes(objectType as EntityType))
    return { side: 'object', allowed: predicate.objectTypes ?? [] };
  return undefined;
}

export function factRule(input: {
  kind: AnalysisFact['kind'];
  predicate: OntologyPredicate | undefined;
  subjectType: string | undefined;
  objectType: string | undefined;
  label: string | null | undefined;
  quote: string | null;
  paragraphs: string[] | undefined;
}): FailReason | undefined {
  const { predicate, subjectType, objectType, paragraphs } = input;
  if (subjectType === undefined || (input.kind === 'relationship' && objectType === undefined))
    return 'entity-not-found';
  if (!predicate) return 'predicate-not-in-ontology';
  if (typeMismatch(predicate, subjectType, objectType)) return 'type-not-allowed';
  if (predicate.labeled && !input.label?.trim()) return 'label-missing';
  const quote = input.quote?.trim() ?? '';
  if (!quote || (paragraphs && findTextContext(paragraphs, quote, { fold: true }) === null)) return 'quote-not-found';
  return undefined;
}

export function entityRule(type: string, ontology: Ontology, wordsFound: string[] | undefined): FailReason | undefined {
  if (!ontology.entityTypes.includes(type as EntityType)) return 'entity-not-in-ontology';
  if (wordsFound?.length === 0) return 'words-not-found';
  return undefined;
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
      entityRule(candidate.type, input.ontology, undefined) === undefined &&
      (input.stage === 'all' || candidate.type === input.stage);
    const id = `${candidate.type}:${nameKey(candidate.name)}`;
    const names = [candidate.name, ...candidate.aliases];
    const matches = input.chapters.map((chapter) => ({ chapter, wordsFound: namesFound(chapter.paragraphs, names) }));
    const destinations = typeAllowed ? matches.filter((match) => match.wordsFound.length > 0) : [];
    if (destinations.length === 0) {
      entities.get(first.index)!.push({
        id,
        type: candidate.type as AnalysisEntity['type'],
        name: candidate.name,
        aliases: candidate.aliases,
        ...(candidate.titles.length ? { titles: candidate.titles } : {}),
      });
      errors.push(
        typeAllowed
          ? `Entity "${candidate.name}" (${candidate.type}): the name or aliases are not in the chapter text.`
          : `Entity "${candidate.name}": type "${candidate.type}" is not allowed; use one of: ${input.stage === 'all' ? input.ontology.entityTypes.join(', ') : input.stage}.`,
      );
      continue;
    }
    for (const { chapter } of destinations)
      entities.get(chapter.index)!.push({
        id,
        type: candidate.type as AnalysisEntity['type'],
        name: candidate.name,
        aliases: candidate.aliases,
        ...(candidate.titles.length ? { titles: candidate.titles } : {}),
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
  const matches = entities.filter((entity) =>
    [entity.name, ...entity.aliases].some((word) => nameKey(word) === normalized),
  );
  return matches.find((entity) => types.includes(entity.type as EntityType)) ?? matches[0];
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

function typeDetail(
  predicate: OntologyPredicate,
  subject: AnalysisEntity,
  object: AnalysisEntity | undefined,
): string | undefined {
  const mismatch = typeMismatch(predicate, subject.type, object?.type);
  if (!mismatch) return undefined;
  const side = mismatch.side === 'subject' ? subject : object!;
  return `"${side.name}" is a ${side.type}; ${predicate.name} ${mismatch.side}s must be: ${mismatch.allowed.join(', ')}.`;
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
  for (const raw of input.output.facts) {
    const predicateName = raw.predicate.trim();
    const predicate = findPredicate(input.ontology, predicateName);
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
    };
    const duplicateKey = JSON.stringify([
      nameKey(fact.predicate),
      nameKey(subject?.id ?? raw.subject),
      kind === 'relationship' ? nameKey(object?.id ?? raw.object ?? '') : nameKey(quote),
      nameKey(label),
    ]);
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    const reason = factRule({
      kind,
      predicate,
      subjectType: subject?.type,
      objectType: object?.type,
      label,
      quote,
      paragraphs: input.chapter.paragraphs,
    });
    if (reason)
      errors.push(
        factError(
          fact,
          reason,
          input.ontology,
          predicate && subject ? typeDetail(predicate, subject, object) : undefined,
        ),
      );
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
  return { entities: entities.length, facts: facts.length };
}
