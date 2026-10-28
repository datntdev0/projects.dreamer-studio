import type { AnalysisIssueCounts, ReviewItem, ReviewQuery, TextContext, WorldEditEntity } from '../models/analysis';
import type { WorldFact, WorldIssue } from '../models/analysis';
import { findTextContext } from './text-match';

interface ReviewModel {
  state: { entities: WorldEditEntity[]; facts: WorldFact[] };
  issues: WorldIssue[];
}

interface ReviewChapter {
  index: number;
  title: string;
  paragraphs: string[];
}

function issueContext(paragraphs: string[], fact: WorldFact | null, entities: WorldEditEntity[]): TextContext | null {
  if (fact) return fact.quote ? findTextContext(paragraphs, fact.quote, { fold: true }) : null;
  for (const word of entities.flatMap((entity) => [entity.name, ...entity.aliases])) {
    const context = findTextContext(paragraphs, word, { fold: true });
    if (context) return context;
  }
  return null;
}

export function reviewItems(model: ReviewModel, chapters: ReviewChapter[]): ReviewItem[] {
  return model.issues.map((issue) => {
    const chapterIndex = issue.chapters[0] ?? 0;
    const chapter = chapters.find((item) => item.index === chapterIndex);
    const entities = model.state.entities.filter((entity) => issue.entityIds.includes(entity.id));
    const fact =
      model.state.facts.find(
        (item) => item.id === issue.fact?.factId && item.chapterIndex === issue.fact.chapterIndex,
      ) ?? null;
    return {
      issue,
      entities,
      fact,
      chapterIndex,
      chapterTitle: chapter?.title ?? '',
      context: chapter ? issueContext(chapter.paragraphs, fact, entities) : null,
    };
  });
}

export function filterReviewItems(items: ReviewItem[], query: ReviewQuery): ReviewItem[] {
  return items.filter(
    (item) =>
      (query.itemKind === 'all' || (query.itemKind === 'entity') === (item.fact === null)) &&
      (query.chapterIndex === null || item.issue.chapters.includes(query.chapterIndex)),
  );
}

export function issueCounts(issues: WorldIssue[]): AnalysisIssueCounts {
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  };
}
