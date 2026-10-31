import type { AnalysisEntity, AnalysisFact, EntityTypeName, FactRef, IssueSeverity } from '../models/analysis';
import type { Occurrence, Ontology, QuoteMatch, World, WorldEditEntity } from '../models/analysis';
import type { WorldEditScope, WorldEntity, WorldFact, WorldIssue } from '../models/analysis';
import type { WorldLink, WorldScalar } from '../models/analysis';
import { ENTITY_TYPES } from '../models/analysis';
import type { CandidateChapter } from './analysis-checks';
import { mergeWords, nameKey } from './analysis-checks';
import type { DraftState } from './world-edit';
import { factKey, touchesEntity } from './world-edit';
import { checkWorld } from './world-checks';
import { foldedText } from './folded-text';

export interface WorldSource {
  index: number;
  title: string;
  stale: boolean;
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
}

export interface WorldModel {
  state: DraftState;
  issues: WorldIssue[];
  staleChapters: number[];
}

export interface WorldScope {
  chapter: number | null;
  only: boolean;
}

function isEntityType(type: string): boolean {
  return (ENTITY_TYPES as readonly string[]).includes(type);
}

function mergeSource(source: WorldSource, entities: Map<string, WorldEditEntity>, facts: WorldFact[]): void {
  const idToWorld = new Map<string, string>();
  for (const item of source.entities) {
    const type: EntityTypeName = isEntityType(item.type) ? item.type : 'unknown';
    const key = `${type}:${nameKey(item.name.trim())}`;
    let entity = entities.get(key);
    if (!entity) {
      entity = { id: item.id, type, name: item.name, aliases: [], titles: [], chapters: [] };
      entities.set(key, entity);
    }
    idToWorld.set(item.id, entity.id);
    if (!entity.chapters.includes(source.index)) entity.chapters.push(source.index);
    entity.aliases = mergeWords(entity.aliases, item.aliases);
    entity.titles = mergeWords(entity.titles, item.titles ?? []);
  }
  for (const fact of source.facts)
    facts.push({
      ...fact,
      chapterIndex: source.index,
      subjectId: idToWorld.get(fact.subjectId) ?? '',
      ...(fact.objectId === undefined ? {} : { objectId: idToWorld.get(fact.objectId) ?? '' }),
    });
}

export function mergeChapters(sources: WorldSource[]): DraftState {
  const entities = new Map<string, WorldEditEntity>();
  const facts: WorldFact[] = [];
  for (const source of sources) mergeSource(source, entities, facts);
  return { entities: [...entities.values()], facts };
}

export function buildModel(input: {
  sources: WorldSource[];
  ontology: Ontology;
  texts: CandidateChapter[];
}): WorldModel {
  const state = mergeChapters(input.sources);
  return {
    state,
    issues: checkWorld({ ...state, ontology: input.ontology, texts: input.texts }),
    staleChapters: input.sources.filter((source) => source.stale).map((source) => source.index),
  };
}

function inScope(index: number, scope: WorldScope): boolean {
  if (scope.chapter === null) return true;
  return scope.only ? index === scope.chapter : index <= scope.chapter;
}

function worst(a: IssueSeverity | undefined, b: IssueSeverity | undefined): IssueSeverity | undefined {
  return a === 'error' || b === 'error' ? 'error' : (a ?? b);
}

function raise(map: Map<string, IssueSeverity>, key: string, severity: IssueSeverity): void {
  map.set(key, worst(map.get(key), severity)!);
}

function severities(issues: WorldIssue[]): { entities: Map<string, IssueSeverity>; facts: Map<string, IssueSeverity> } {
  const entities = new Map<string, IssueSeverity>();
  const facts = new Map<string, IssueSeverity>();
  for (const issue of issues) {
    for (const id of issue.entityIds) raise(entities, id, issue.severity);
    if (issue.fact)
      raise(facts, factKey({ id: issue.fact.factId, chapterIndex: issue.fact.chapterIndex }), issue.severity);
  }
  return { entities, facts };
}

function flag<K extends string>(key: K, on: boolean): { [P in K]?: true } {
  return (on ? { [key]: true } : {}) as { [P in K]?: true };
}

export function toGraph(model: WorldModel, scope: WorldScope): World {
  const stale = new Set(model.staleChapters);
  const severity = severities(model.issues);
  const entities = new Map<string, WorldEntity>();
  for (const item of model.state.entities) {
    const chapters = item.chapters.filter((index) => inScope(index, scope));
    if (item.chapters.length && !chapters.length) continue;
    const staleChapters = chapters.filter((index) => stale.has(index));
    entities.set(item.id, {
      ...item,
      chapters,
      degree: 0,
      scalars: [],
      staleChapters,
      ...flag('stale', staleChapters.length > 0),
      ...(severity.entities.has(item.id) ? { issue: severity.entities.get(item.id) } : {}),
    });
  }
  const links = new Map<string, WorldLink>();
  for (const fact of model.state.facts) {
    const subject = entities.get(fact.subjectId);
    if (!subject || !inScope(fact.chapterIndex, scope)) continue;
    const key = factKey(fact);
    const isStale = stale.has(fact.chapterIndex);
    const issue = severity.facts.get(key);
    if (fact.kind === 'scalar') {
      const scalar: WorldScalar = {
        factId: fact.id,
        predicate: fact.predicate,
        chapterIndex: fact.chapterIndex,
        quote: fact.quote,
        ...flag('stale', isStale),
        ...(issue ? { issue } : {}),
      };
      subject.scalars.push(scalar);
      continue;
    }
    const object = fact.objectId ? entities.get(fact.objectId) : undefined;
    if (!object || object.id === subject.id) continue;
    const linkKey = `${subject.id}|${fact.predicate.toLocaleLowerCase()}|${fact.label?.toLocaleLowerCase() ?? ''}|${object.id}`;
    let link = links.get(linkKey);
    if (!link) {
      link = {
        factRefs: [],
        source: subject.id,
        target: object.id,
        predicate: fact.predicate,
        ...(fact.label ? { label: fact.label } : {}),
        chapters: [],
        quotes: [],
        staleChapters: [],
      };
      links.set(linkKey, link);
    }
    link.factRefs.push({ factId: fact.id, chapterIndex: fact.chapterIndex });
    if (!link.chapters.includes(fact.chapterIndex)) link.chapters.push(fact.chapterIndex);
    if (fact.quote && !link.quotes.includes(fact.quote)) link.quotes.push(fact.quote);
    if (isStale) {
      link.stale = true;
      if (!link.staleChapters.includes(fact.chapterIndex)) link.staleChapters.push(fact.chapterIndex);
    }
    const linkIssue = worst(link.issue, issue);
    if (linkIssue) link.issue = linkIssue;
  }
  for (const link of links.values()) {
    entities.get(link.source)!.degree++;
    entities.get(link.target)!.degree++;
  }
  for (const entity of entities.values()) entity.scalars.sort((a, b) => b.chapterIndex - a.chapterIndex);
  return { entities: [...entities.values()], links: [...links.values()] };
}

function isRefFact(fact: WorldFact, ref: FactRef | undefined): boolean {
  return !!ref && fact.id === ref.factId && fact.chapterIndex === ref.chapterIndex;
}

function addEnds(ids: Set<string>, facts: WorldFact[]): void {
  for (const fact of facts) for (const id of [fact.subjectId, fact.objectId]) if (id) ids.add(id);
}

export function editScope(
  model: WorldModel,
  request: { issueKey: string | null; entityIds: string[] },
): WorldEditScope {
  const catalog = model.state.entities;
  const issue = request.issueKey ? (model.issues.find((item) => item.key === request.issueKey) ?? null) : null;
  const issueFact = model.state.facts.find((fact) => isRefFact(fact, issue?.fact));
  const ids = new Set<string>(issue ? issue.entityIds : request.entityIds);
  addEnds(ids, issueFact ? [issueFact] : []);
  const touching = model.state.facts.filter((fact) => [...ids].some((id) => touchesEntity(fact, id)));
  if (!issue) addEnds(ids, touching);
  return {
    issue,
    entities: catalog.filter((entity) => ids.has(entity.id)),
    facts: model.state.facts.filter((fact) => fact === issueFact || touching.includes(fact)),
    catalog,
    focus: issue ? [] : request.entityIds,
  };
}

export interface OccurrenceChapter {
  index: number;
  title: string;
  paragraphs: string[];
}

export function entityOccurrences(entity: WorldEntity, chapters: OccurrenceChapter[]): Occurrence[] {
  return [...entity.chapters]
    .sort((a, b) => a - b)
    .map((index) => {
      const chapter = chapters.find((item) => item.index === index);
      const context =
        [entity.name, ...entity.aliases]
          .map((needle) => (chapter ? foldedText(chapter.paragraphs).context(needle) : null))
          .find((item) => item !== null) ?? null;
      return { chapterIndex: index, chapterTitle: chapter?.title ?? '', context };
    });
}

export function findQuoteMatches(chapters: OccurrenceChapter[], quote: string): QuoteMatch[] {
  const needle = quote.trim();
  if (!needle) return [];
  return chapters.flatMap((chapter) => {
    const context = foldedText(chapter.paragraphs).context(needle);
    return context ? [{ chapterIndex: chapter.index, chapterTitle: chapter.title, context }] : [];
  });
}
