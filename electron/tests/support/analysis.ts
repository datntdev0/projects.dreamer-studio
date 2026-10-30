import './fixtures';
import type { AnalysisEntity, AnalysisFact } from '@dreamer/shared/models/analysis';
import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { emptyIndex, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { readAnalysisIndex, writeAnalysisIndex, writeChapterResult } from '../../main/features/analysis/analysis-files';
import type { seedNovel } from './fixtures';

export async function seedAnalysis(
  seed: Awaited<ReturnType<typeof seedNovel>>,
  index: number,
  entities: AnalysisEntity[],
  facts: AnalysisFact[] = [],
) {
  const chapter = seed.novel.chapters[index - 1];
  const analysedAt = new Date().toISOString();
  await writeChapterResult(seed.folder, {
    version: 1,
    index,
    file: chapter.file,
    title: chapter.title,
    analysedAt,
    llm: 'fake',
    entities,
    facts,
  });
  await writeAnalysisIndex(
    seed.folder,
    upsertIndexEntry(readAnalysisIndex(seed.folder) ?? emptyIndex(), {
      index,
      file: chapter.file,
      counts: chapterCounts(entities, facts),
      analysedAt,
    }),
  );
}

export function persona(id = 'mai', name = 'Mai'): AnalysisEntity {
  return { id, name, type: 'Persona', aliases: [] };
}
