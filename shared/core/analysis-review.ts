import type { AnalysisIssueCounts, ReviewItem, ReviewQuery, TextContext, WorldEditEntity } from '../models/analysis';
import type { WorldFact, WorldIssue } from '../models/analysis';
import { foldedText } from './folded-text';

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
  const text = foldedText(paragraphs);
  if (fact) return fact.quote ? text.context(fact.quote) : null;
  for (const word of entities.flatMap((entity) => [entity.name, ...entity.aliases])) {
    const context = text.context(word);
    if (context) return context;
  }
  return null;
}

export function reviewItems(model: ReviewModel, chapters: ReviewChapter[]): ReviewItem[] {
  const byChapter = new Map(chapters.map((chapter) => [chapter.index, chapter]));
  const byEntity = new Map(model.state.entities.map((entity, position) => [entity.id, { entity, position }]));
  const byFact = new Map(model.state.facts.map((fact) => [`${fact.chapterIndex}:${fact.id}`, fact]));
  return model.issues.map((issue) => {
    const chapterIndex = issue.chapters[0] ?? 0;
    const chapter = byChapter.get(chapterIndex);
    const entities = [...new Set(issue.entityIds)]
      .flatMap((id) => byEntity.get(id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((item) => item.entity);
    const fact = (issue.fact && byFact.get(`${issue.fact.chapterIndex}:${issue.fact.factId}`)) ?? null;
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
