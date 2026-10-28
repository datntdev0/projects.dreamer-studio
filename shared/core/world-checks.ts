import type {
  FailReason,
  IssueSeverity,
  Ontology,
  OntologyPredicate,
  WorldEditEntity,
  WorldFact,
  WorldIssue,
} from '../models/analysis';
import { entityRule, factRule, findPredicate, namesFound, nameKey, typeMismatch } from './analysis-checks';
import type { CandidateChapter } from './analysis-checks';
import { HAS_PERSONA } from './ontology-rules';

export const REASON_SEVERITY: Record<FailReason, IssueSeverity> = {
  'words-not-found': 'error',
  'quote-not-found': 'error',
  'entity-not-in-ontology': 'error',
  'predicate-not-in-ontology': 'error',
  'entity-not-found': 'error',
  'type-not-allowed': 'error',
  'label-missing': 'warning',
  'name-conflict': 'warning',
  'alias-conflict': 'warning',
};

export interface WorldCheckInput {
  entities: WorldEditEntity[];
  facts: WorldFact[];
  ontology: Ontology;
  texts: CandidateChapter[];
}

type Texts = Map<number, string[]>;

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function issue(
  reason: FailReason,
  key: string,
  base: Pick<WorldIssue, 'entityIds' | 'chapters' | 'params'> & Partial<Pick<WorldIssue, 'fact'>>,
): WorldIssue {
  return { key, reason, severity: REASON_SEVERITY[reason], ...base, chapters: sortedUnique(base.chapters) };
}

function entityChapters(entity: WorldEditEntity, facts: WorldFact[]): number[] {
  if (entity.chapters.length > 0) return entity.chapters;
  return facts
    .filter((fact) => fact.subjectId === entity.id || fact.objectId === entity.id)
    .map((fact) => fact.chapterIndex);
}

function entityIssue(entity: WorldEditEntity, input: WorldCheckInput, texts: Texts): WorldIssue | undefined {
  const chapters = sortedUnique(entityChapters(entity, input.facts));
  const names = [entity.name, ...entity.aliases];
  const missing = chapters.filter((index) => {
    const paragraphs = texts.get(index);
    return paragraphs !== undefined && namesFound(paragraphs, names).length === 0;
  });
  const reason = entityRule(entity.type, input.ontology, missing.length > 0 ? [] : undefined);
  if (!reason) return undefined;
  const params: Record<string, string> =
    reason === 'words-not-found'
      ? { name: entity.name, chapters: missing.join(', ') }
      : { name: entity.name, type: entity.type };
  return issue(reason, `${reason}:entity:${entity.id}`, {
    entityIds: [entity.id],
    chapters: reason === 'words-not-found' ? missing : chapters,
    params,
  });
}

function isPersonaPair(types: Set<string>, ontology: Ontology): boolean {
  const predicate = ontology.predicates.find((item) => item.name === HAS_PERSONA);
  const pair: string[] = [...(predicate?.subjectTypes ?? []), ...(predicate?.objectTypes ?? [])];
  return pair.length === 2 && types.size === 2 && pair.every((type) => types.has(type));
}

function nameConflicts(input: WorldCheckInput): WorldIssue[] {
  const groups = new Map<string, WorldEditEntity[]>();
  for (const entity of input.entities)
    groups.set(nameKey(entity.name), [...(groups.get(nameKey(entity.name)) ?? []), entity]);
  const issues: WorldIssue[] = [];
  for (const [key, group] of groups) {
    const types = new Set<string>(group.map((entity) => entity.type));
    if (types.size < 2 || isPersonaPair(types, input.ontology)) continue;
    issues.push(
      issue('name-conflict', `name-conflict:${key}`, {
        entityIds: group.map((entity) => entity.id),
        chapters: group.flatMap((entity) => entity.chapters),
        params: { name: group[0].name, types: [...types].sort().join(', ') },
      }),
    );
  }
  return issues;
}

function aliasConflicts(input: WorldCheckInput): WorldIssue[] {
  const issues: WorldIssue[] = [];
  for (const entity of input.entities) {
    const alias = entity.aliases.find(
      (word) =>
        nameKey(word) !== nameKey(entity.name) &&
        input.entities.some((other) => other.id !== entity.id && nameKey(other.name) === nameKey(word)),
    );
    if (alias === undefined) continue;
    issues.push(
      issue('alias-conflict', `alias-conflict:entity:${entity.id}`, {
        entityIds: [entity.id],
        chapters: entity.chapters,
        params: { name: entity.name, alias },
      }),
    );
  }
  return issues;
}

function factParams(
  reason: FailReason,
  fact: WorldFact,
  subject: WorldEditEntity | undefined,
  object: WorldEditEntity | undefined,
  predicate: OntologyPredicate | undefined,
): Record<string, string> {
  if (reason === 'entity-not-found') return { name: (subject ? fact.objectName : fact.subjectName) ?? '' };
  if (reason === 'quote-not-found') return { chapter: String(fact.chapterIndex) };
  if (reason !== 'type-not-allowed') return { predicate: fact.predicate };
  const mismatch = predicate && subject ? typeMismatch(predicate, subject.type, object?.type) : undefined;
  const typed = mismatch?.side === 'object' ? object : subject;
  return {
    name: typed?.name ?? '',
    type: typed?.type ?? '',
    predicate: fact.predicate,
    allowed: mismatch?.allowed.join(', ') ?? '',
  };
}

function factIssue(
  fact: WorldFact,
  input: WorldCheckInput,
  byId: Map<string, WorldEditEntity>,
  texts: Texts,
): WorldIssue | undefined {
  const subject = byId.get(fact.subjectId);
  const object = fact.objectId ? byId.get(fact.objectId) : undefined;
  const predicate = findPredicate(input.ontology, fact.predicate);
  const paragraphs = texts.get(fact.chapterIndex);
  const reason = factRule({
    kind: fact.kind,
    predicate,
    subjectType: subject?.type,
    objectType: object?.type,
    label: fact.label,
    quote: fact.quote,
    paragraphs,
  });
  if (!reason) return undefined;
  return issue(reason, `${reason}:fact:${fact.chapterIndex}:${fact.id}`, {
    entityIds: [subject?.id, object?.id].filter((id): id is string => id !== undefined),
    chapters: [fact.chapterIndex],
    params: factParams(reason, fact, subject, object, predicate),
    fact: { factId: fact.id, chapterIndex: fact.chapterIndex },
  });
}

export function checkWorld(input: WorldCheckInput): WorldIssue[] {
  const texts: Texts = new Map(input.texts.map((chapter) => [chapter.index, chapter.paragraphs]));
  const byId = new Map(input.entities.map((entity) => [entity.id, entity]));
  const found = [
    ...input.entities.map((entity) => entityIssue(entity, input, texts)),
    ...input.facts.map((fact) => factIssue(fact, input, byId, texts)),
  ];
  return [
    ...found.filter((item): item is WorldIssue => item !== undefined),
    ...nameConflicts(input),
    ...aliasConflicts(input),
  ];
}
