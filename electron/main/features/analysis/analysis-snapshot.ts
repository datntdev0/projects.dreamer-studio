import { statSync } from 'node:fs';
import { isUpToDate, chapterStatuses } from '@dreamer/shared/core/analysis-plan';
import { buildModel, OccurrenceChapter, WorldModel, WorldSource } from '@dreamer/shared/core/world';
import { ChapterAnalysisSummary, ChapterResult, OntologyParseResult } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { NovelFolder } from '../library/library-files';
import { analysisIndexFile, chapterResultFile, readAnalysisIndex, readChapterResult } from './analysis-files';
import { readReviewParagraphs } from './analysis-files';
import { worldOverlayFile } from './analysis-files';
import { loadOntology, novelOntologyFile } from './analysis-ontology';
import { overlayEdits } from './analysis-overlay';

export interface AnalysisSnapshot {
  chapters: ChapterAnalysisSummary[];
  parsed: OntologyParseResult;
  model: WorldModel;
  texts: OccurrenceChapter[];
  chapterTexts: OccurrenceChapter[];
}

function modifiedAt(file: string): string {
  try {
    const details = statSync(file);
    return `${details.mtimeMs}:${details.size}`;
  } catch {
    return '0';
  }
}

function fingerprint(folder: NovelFolder, novel: NovelMetadata): string {
  const files: string[] = [analysisIndexFile(folder), worldOverlayFile(folder), novelOntologyFile(folder)];
  const results: string[] = novel.chapters.map(
    (chapter): string => `${chapter.file}:${modifiedAt(chapterResultFile(folder, chapter.file))}`,
  );
  return [...files.map(modifiedAt), ...results].join('|');
}

function isModelled(chapter: ChapterAnalysisSummary): boolean {
  return isUpToDate(chapter.status) || chapter.status === 'stale';
}

export class AnalysisSnapshots {
  private readonly paragraphs: Map<string, string[]> = new Map<string, string[]>();
  private readonly snapshots: Map<string, { key: string; snapshot: AnalysisSnapshot }> = new Map();

  async get(folder: NovelFolder, novel: NovelMetadata): Promise<AnalysisSnapshot> {
    const key: string = fingerprint(folder, novel);
    const cached = this.snapshots.get(novel.id);
    if (cached?.key === key) return cached.snapshot;
    const snapshot: AnalysisSnapshot = await this.build(folder, novel);
    this.snapshots.set(novel.id, { key, snapshot });
    return snapshot;
  }

  async build(folder: NovelFolder, novel: NovelMetadata): Promise<AnalysisSnapshot> {
    const chapters: ChapterAnalysisSummary[] = chapterStatuses(novel.chapters, readAnalysisIndex(folder));
    const parsed: OntologyParseResult = loadOntology(folder);
    const sources: WorldSource[] = [];
    const chapterTexts: OccurrenceChapter[] = [];
    for (const chapter of chapters.filter(isModelled)) {
      const result: ChapterResult | null = chapter.resultFile ? readChapterResult(folder, chapter.resultFile) : null;
      if (!chapter.resultFile || !result) continue;
      const stale: boolean = !isUpToDate(chapter.status);
      sources.push({
        index: chapter.index,
        title: chapter.title,
        stale,
        entities: result.entities,
        facts: result.facts,
      });
      const paragraphs: string[] = await this.readParagraphs(folder, chapter.resultFile);
      chapterTexts.push({ index: chapter.index, title: chapter.title, paragraphs });
    }
    const texts: OccurrenceChapter[] = chapterTexts.filter((text): boolean => text.paragraphs.length > 0);
    const model: WorldModel = buildModel({ sources, edits: overlayEdits(folder), ontology: parsed.ontology, texts });
    return { chapters, parsed, model, texts, chapterTexts };
  }

  private async readParagraphs(folder: NovelFolder, file: string): Promise<string[]> {
    const cached: string[] | undefined = this.paragraphs.get(file);
    if (cached) return cached;
    const paragraphs: string[] = await readReviewParagraphs(folder, file);
    if (paragraphs.length > 0) this.paragraphs.set(file, paragraphs);
    return paragraphs;
  }
}
