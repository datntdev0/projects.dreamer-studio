import { CodedError, ErrorCode } from '../errors/app-error';
import type { AnalysisEntity, AnalysisFact, FailReason, Ontology, ReviewEdit } from '../models/analysis';
import type { AnalysisIssueCounts, ReviewEntityOption, ReviewItem, ReviewQuery } from '../models/analysis';
import type { ReviewRelated } from '../models/analysis';
import { checkConflicts, checkEntity, checkFact, clashingAliases, nameKey } from './analysis-checks';
import type { CandidateChapter } from './analysis-checks';
import { findTextContext } from './text-match';

export type ReviewSeverity = 'error' | 'warning';

export const REASON_SEVERITY: Record<FailReason, ReviewSeverity> = {
  'words-not-found': 'error',
  'quote-not-found': 'error',
  'entity-not-in-ontology': 'error',
  'predicate-not-in-ontology': 'error',
  'entity-not-found': 'error',
  'type-not-allowed': 'error',
  'value-missing': 'error',
  'value-not-allowed': 'warning',
  'label-missing': 'warning',
  'name-conflict': 'warning',
  'alias-conflict': 'warning',
  'value-conflict': 'warning',
};

export const ACCEPTABLE_REASONS: FailReason[] = (Object.keys(REASON_SEVERITY) as FailReason[]).filter(
  (reason) => REASON_SEVERITY[reason] === 'warning',
);

const FACT_FIELDS: (keyof AnalysisFact)[] = [
  'subjectId',
  'subjectName',
  'predicate',
  'objectId',
  'objectName',
  'value',
  'label',
  'quote',
];

type CheckedItem = AnalysisEntity | AnalysisFact;

export interface ReviewChapter {
  index: number;
  title: string;
  paragraphs: string[];
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
}

export function canAccept(reason: FailReason | undefined): boolean {
  return reason !== undefined && ACCEPTABLE_REASONS.includes(reason);
}

function invalid(message: string): CodedError {
  return new CodedError(ErrorCode.AnalysisEditInvalid, message);
}

function findItem(entities: AnalysisEntity[], facts: AnalysisFact[], edit: ReviewEdit): CheckedItem {
  const items: CheckedItem[] = edit.itemKind === 'entity' ? entities : facts;
  const item = items.find((candidate) => candidate.id === edit.itemId);
  if (!item) throw invalid(`Item ${edit.itemId} not found in chapter ${edit.chapterIndex}`);
  return item;
}

function settle(item: CheckedItem, reason: FailReason | undefined): void {
  item.status = reason ? 'failed' : 'verified';
  if (reason) item.reason = reason;
  else delete item.reason;
}

function fixEntity(
  entity: AnalysisEntity,
  edit: Extract<ReviewEdit, { kind: 'review-fix' }>,
  chapter: CandidateChapter,
  ontology: Ontology,
): void {
  if (!edit.entity?.type && !edit.entity?.aliases && !edit.entity?.name?.trim())
    throw invalid(`Fix of ${entity.id} has no allowed field`);
  if (edit.entity.name?.trim()) entity.name = edit.entity.name.trim();
  if (edit.entity.type) entity.type = edit.entity.type;
  if (edit.entity.aliases) entity.aliases = [...edit.entity.aliases];
  const result = checkEntity(chapter, entity, ontology);
  entity.wordsFound = result.wordsFound;
  settle(entity, result.reason);
}

function fixFact(
  fact: AnalysisFact,
  edit: Extract<ReviewEdit, { kind: 'review-fix' }>,
  input: { chapter: CandidateChapter; entities: AnalysisEntity[]; ontology: Ontology },
): void {
  const patch = edit.fact ?? {};
  const fields = FACT_FIELDS.filter((field) => field in patch);
  if (!fields.length) throw invalid(`Fix of ${fact.id} has no allowed field`);
  Object.assign(fact, Object.fromEntries(fields.map((field) => [field, patch[field]])));
  const nameOf = (id: string | undefined): string | undefined =>
    input.entities.find((entity) => entity.id === id)?.name;
  fact.subjectName = nameOf(fact.subjectId) ?? fact.subjectName;
  if (fact.objectId) fact.objectName = nameOf(fact.objectId);
  settle(fact, checkFact(input.chapter, input.entities, fact, input.ontology));
}

function applyFix(
  item: CheckedItem,
  edit: Extract<ReviewEdit, { kind: 'review-fix' }>,
  input: { chapter: CandidateChapter; entities: AnalysisEntity[]; ontology: Ontology },
): void {
  if (edit.itemKind === 'entity') fixEntity(item as AnalysisEntity, edit, input.chapter, input.ontology);
  else fixFact(item as AnalysisFact, edit, input);
}

export function applyReviewEdit(input: {
  chapter: CandidateChapter;
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
  edit: ReviewEdit;
  ontology: Ontology;
}): { entities: AnalysisEntity[]; facts: AnalysisFact[] } {
  const { chapter, edit, ontology } = input;
  if (edit.chapterIndex !== chapter.index) throw invalid(`Edit is for chapter ${edit.chapterIndex}`);
  const entities = input.entities.map((entity) => ({
    ...entity,
    aliases: [...entity.aliases],
    wordsFound: [...entity.wordsFound],
  }));
  const facts = input.facts.map((fact) => ({ ...fact }));
  const item = findItem(entities, facts, edit);
  if (edit.kind === 'review-accept' && !canAccept(item.reason)) throw invalid(`Item ${item.id} cannot be accepted`);
  item.issue ??= item.reason;
  item.edited = true;
  if (edit.kind === 'review-reject') item.status = 'rejected';
  else if (edit.kind === 'review-accept') item.status = 'accepted';
  else applyFix(item, edit, { chapter, entities, ontology });
  return checkConflicts({ entities, facts, ontology });
}

export function chapterReviewStatus(
  entities: AnalysisEntity[],
  facts: AnalysisFact[],
): 'clean' | 'has-issues' | 'reviewed' {
  const items: CheckedItem[] = [...entities, ...facts];
  if (items.some((item) => item.status === 'failed')) return 'has-issues';
  return items.some((item) => item.issue) ? 'reviewed' : 'clean';
}

export function isOpenError(item: CheckedItem): boolean {
  return item.status === 'failed' && item.reason !== undefined && REASON_SEVERITY[item.reason] === 'error';
}

export function isMergeable(item: CheckedItem): boolean {
  return item.status !== 'rejected' && !isOpenError(item);
}

function hasIssue(item: CheckedItem): boolean {
  return item.status === 'failed' || item.issue !== undefined;
}

function itemOf(item: ReviewItem): CheckedItem {
  return item.entity ?? item.fact!;
}

export function reviewIssueKey(item: ReviewItem): string {
  const target: CheckedItem = itemOf(item);
  const reason: FailReason | undefined = target.issue ?? target.reason;
  if (item.entity && (reason === 'name-conflict' || reason === 'alias-conflict'))
    return `${reason}:${nameKey(item.entity.name)}`;
  if (item.fact && reason === 'value-conflict') return `${reason}:${item.fact.subjectId}:${item.fact.predicate}`;
  return `${reason}:${item.chapterIndex}:${item.itemKind}:${target.id}`;
}

function namedEntities(chapters: ReviewChapter[]): Map<string, ReviewRelated[]> {
  const named: Map<string, ReviewRelated[]> = new Map<string, ReviewRelated[]>();
  for (const chapter of chapters)
    for (const entity of chapter.entities.filter((item: AnalysisEntity): boolean => item.status !== 'rejected')) {
      const list: ReviewRelated[] = named.get(nameKey(entity.name)) ?? [];
      const same: ReviewRelated | undefined = list.find((item: ReviewRelated): boolean => item.type === entity.type);
      if (same) same.chapters.push(chapter.index);
      else list.push({ name: entity.name, type: entity.type, chapters: [chapter.index] });
      named.set(nameKey(entity.name), list);
    }
  return named;
}

function relatedOf(entity: AnalysisEntity, named: Map<string, ReviewRelated[]>): ReviewRelated[] {
  return clashingAliases(entity, new Set<string>(named.keys())).flatMap(
    (alias: string): ReviewRelated[] => named.get(nameKey(alias)) ?? [],
  );
}

function chapterReviewItems(chapter: ReviewChapter, named: Map<string, ReviewRelated[]>): ReviewItem[] {
  const base = { chapterIndex: chapter.index, chapterTitle: chapter.title };
  const nameOf = (id: string | undefined): string | undefined =>
    chapter.entities.find((entity: AnalysisEntity): boolean => entity.id === id)?.name;
  const items: ReviewItem[] = [
    ...chapter.entities.filter(hasIssue).map((entity: AnalysisEntity): ReviewItem => ({
      ...base,
      itemKind: 'entity',
      entity,
      context: findTextContext(chapter.paragraphs, entity.wordsFound[0] ?? entity.name, { fold: true }),
      ...(entity.issue === 'alias-conflict' ? { related: relatedOf(entity, named) } : {}),
    })),
    ...chapter.facts.filter(hasIssue).map((fact: AnalysisFact): ReviewItem => ({
      ...base,
      itemKind: 'fact',
      fact,
      subjectName: nameOf(fact.subjectId),
      objectName: nameOf(fact.objectId),
      context: fact.quote ? findTextContext(chapter.paragraphs, fact.quote, { fold: true }) : null,
    })),
  ];
  return items.map((item: ReviewItem): ReviewItem => ({ ...item, issueKey: reviewIssueKey(item) }));
}

export function reviewItems(chapters: ReviewChapter[]): ReviewItem[] {
  const named: Map<string, ReviewRelated[]> = namedEntities(chapters);
  return chapters.flatMap((chapter: ReviewChapter): ReviewItem[] => chapterReviewItems(chapter, named));
}

export function reviewEntityOptions(chapters: ReviewChapter[]): Record<number, ReviewEntityOption[]> {
  return Object.fromEntries(
    chapters.map((chapter: ReviewChapter): [number, ReviewEntityOption[]] => [
      chapter.index,
      chapter.entities
        .filter((entity: AnalysisEntity): boolean => entity.status !== 'rejected')
        .map((entity: AnalysisEntity): ReviewEntityOption => ({ id: entity.id, name: entity.name, type: entity.type })),
    ]),
  );
}

function issues(items: ReviewItem[]): Map<string, ReviewItem[]> {
  const grouped: Map<string, ReviewItem[]> = new Map<string, ReviewItem[]>();
  for (const item of items) {
    if (!grouped.has(item.issueKey!)) grouped.set(item.issueKey!, []);
    grouped.get(item.issueKey!)!.push(item);
  }
  return grouped;
}

export function issueCounts(items: ReviewItem[]): AnalysisIssueCounts {
  const open: ReviewItem[][] = [...issues(items).values()].filter((issue: ReviewItem[]): boolean =>
    issue.some((item: ReviewItem): boolean => itemOf(item).status === 'failed'),
  );
  return {
    open: open.length,
    errors: open.filter((issue: ReviewItem[]): boolean =>
      issue.some((item: ReviewItem): boolean => isOpenError(itemOf(item))),
    ).length,
  };
}

export function filterReviewItems(items: ReviewItem[], query: ReviewQuery): ReviewItem[] {
  const grouped: Map<string, ReviewItem[]> = issues(items);
  return items.filter((item: ReviewItem): boolean => {
    const issue: ReviewItem[] = grouped.get(item.issueKey!)!;
    const status = itemOf(item).status;
    const statusMatch: boolean =
      query.status === 'all' ||
      (query.status === 'open'
        ? issue.some((other: ReviewItem): boolean => itemOf(other).status === 'failed')
        : status === query.status);
    return (
      statusMatch &&
      (query.itemKind === 'all' || item.itemKind === query.itemKind) &&
      (query.chapterIndex === null ||
        issue.some((other: ReviewItem): boolean => other.chapterIndex === query.chapterIndex))
    );
  });
}
