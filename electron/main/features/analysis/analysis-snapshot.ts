import { stat } from 'node:fs/promises';
import { isUpToDate, chapterStatuses } from '@dreamer/shared/core/analysis-plan';
import { buildModel, OccurrenceChapter, WorldModel, WorldSource } from '@dreamer/shared/core/world';
import { ChapterAnalysisSummary, ChapterResult, OntologyParseResult } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { NovelFolder } from '../library/library-files';
import { analysisGeneration, analysisIndexFile, loadChapterResult, readAnalysisIndex } from './analysis-files';
import { readReviewParagraphs } from './analysis-files';
import { loadOntology, novelOntologyFile } from './analysis-ontology';

const PARAGRAPH_CACHE_LIMIT = 4000;

export interface SnapshotChapter {
  index: number;
  title: string;
  file: string;
  stale: boolean;
  result: ChapterResult;
}

export interface AnalysisSnapshot {
  chapters: ChapterAnalysisSummary[];
  parsed: OntologyParseResult;
  model: WorldModel;
  results: SnapshotChapter[];
  texts: OccurrenceChapter[];
  chapterTexts: OccurrenceChapter[];
}

async function modifiedAt(file: string): Promise<string> {
  try {
    const details = await stat(file);
    return `${details.mtimeMs}:${details.size}`;
  } catch {
    return '0';
  }
}

async function fingerprint(folder: NovelFolder, novel: NovelMetadata): Promise<string> {
  const files: string[] = await Promise.all([analysisIndexFile(folder), novelOntologyFile(folder)].map(modifiedAt));
  const chapters: string = novel.chapters.map((chapter): string => `${chapter.file}:${chapter.title}`).join(',');
  return [...files, analysisGeneration(folder), chapters].join('|');
}

export function modelWith(snapshot: AnalysisSnapshot, results: ChapterResult[]): WorldModel {
  const replaced: Map<string, ChapterResult> = new Map(
    results.map((result): [string, ChapterResult] => [result.file, result]),
  );
  const sources: WorldSource[] = snapshot.results.map((chapter: SnapshotChapter): WorldSource => {
    const result: ChapterResult = replaced.get(chapter.file) ?? chapter.result;
    return {
      index: chapter.index,
      title: chapter.title,
      stale: chapter.stale,
      entities: result.entities,
      facts: result.facts,
    };
  });
  return buildModel({ sources, ontology: snapshot.parsed.ontology, texts: snapshot.texts });
}

function isModelled(chapter: ChapterAnalysisSummary): boolean {
  return isUpToDate(chapter.status) || chapter.status === 'stale';
}

export class AnalysisSnapshots {
  private readonly paragraphs: Map<string, string[]> = new Map<string, string[]>();
  private readonly snapshots: Map<string, { key: string; snapshot: Promise<AnalysisSnapshot> }> = new Map();

  async get(folder: NovelFolder, novel: NovelMetadata): Promise<AnalysisSnapshot> {
    const key: string = await fingerprint(folder, novel);
    const cached = this.snapshots.get(novel.id);
    if (cached?.key === key) return cached.snapshot;
    const snapshot: Promise<AnalysisSnapshot> = this.build(folder, novel);
    this.snapshots.set(novel.id, { key, snapshot });
    snapshot.catch((): void => {
      if (this.snapshots.get(novel.id)?.snapshot === snapshot) this.snapshots.delete(novel.id);
    });
    return snapshot;
  }

  async build(folder: NovelFolder, novel: NovelMetadata): Promise<AnalysisSnapshot> {
    const chapters: ChapterAnalysisSummary[] = chapterStatuses(novel.chapters, readAnalysisIndex(folder));
    const parsed: OntologyParseResult = loadOntology(folder);
    const modelled: ChapterAnalysisSummary[] = chapters.filter(
      (chapter: ChapterAnalysisSummary): boolean => isModelled(chapter) && !!chapter.resultFile,
    );
    const loaded = await Promise.all(
      modelled.map(async (chapter: ChapterAnalysisSummary) => ({
        chapter,
        result: await loadChapterResult(folder, chapter.resultFile!),
        paragraphs: await this.readParagraphs(folder, chapter.resultFile!),
      })),
    );
    const sources: WorldSource[] = [];
    const results: SnapshotChapter[] = [];
    const chapterTexts: OccurrenceChapter[] = [];
    for (const { chapter, result, paragraphs } of loaded) {
      if (!result) continue;
      const stale: boolean = !isUpToDate(chapter.status);
      sources.push({
        index: chapter.index,
        title: chapter.title,
        stale,
        entities: result.entities,
        facts: result.facts,
      });
      results.push({ index: chapter.index, title: chapter.title, file: chapter.resultFile!, stale, result });
      chapterTexts.push({ index: chapter.index, title: chapter.title, paragraphs });
    }
    const texts: OccurrenceChapter[] = chapterTexts.filter((text): boolean => text.paragraphs.length > 0);
    const model: WorldModel = buildModel({ sources, ontology: parsed.ontology, texts });
    return { chapters, parsed, model, results, texts, chapterTexts };
  }

  private async readParagraphs(folder: NovelFolder, file: string): Promise<string[]> {
    const cached: string[] | undefined = this.paragraphs.get(file);
    if (cached) return cached;
    const paragraphs: string[] = await readReviewParagraphs(folder, file);
    if (paragraphs.length === 0) return paragraphs;
    if (this.paragraphs.size >= PARAGRAPH_CACHE_LIMIT) this.paragraphs.delete(this.paragraphs.keys().next().value!);
    this.paragraphs.set(file, paragraphs);
    return paragraphs;
  }
}
