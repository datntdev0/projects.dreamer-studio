import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { ChapterMatch, matchChapters } from '@dreamer/shared/core/analysis-plan';
import { activeOverlay, buildWorld, factBase, OccurrenceChapter } from '@dreamer/shared/core/world';
import { checkOverlayEdit } from '@dreamer/shared/core/world-overlay-checks';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisChapterDetail, AnalysisFact, Ontology, OverlayEdit } from '@dreamer/shared/models/analysis';
import { World, WorldFile, WorldFileChapter } from '@dreamer/shared/models/analysis';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { NovelFolder } from '../library/library-files';
import { readReviewParagraphs, readWorldFile, readWorldOverlay, writeWorldOverlay } from './analysis-files';

function worldFileDetail(
  match: ChapterMatch<WorldFileChapter>,
  chapter: { file: string; title: string },
): AnalysisChapterDetail {
  return {
    index: match.index,
    title: chapter.title,
    file: chapter.file,
    resultFile: match.entry.file,
    status: match.stale ? 'stale' : 'clean',
    counts: chapterCounts(match.entry.entities, match.entry.facts),
    pending: false,
    paragraphs: [],
    entities: match.entry.entities,
    facts: match.entry.facts,
  };
}

export function worldFileChapters(
  file: WorldFile | null,
  chapters: { file: string; title: string }[],
): AnalysisChapterDetail[] {
  return file
    ? matchChapters(file.chapters, chapters).map((match: ChapterMatch<WorldFileChapter>): AnalysisChapterDetail =>
        worldFileDetail(match, chapters[match.index - 1]),
      )
    : [];
}

export function overlayEdits(folder: NovelFolder): OverlayEdit[] {
  return readWorldOverlay(folder)?.edits ?? [];
}

function withBase(edit: OverlayEdit, chapters: AnalysisChapterDetail[]): OverlayEdit {
  if (edit.kind !== 'fact-edit' && edit.kind !== 'fact-delete') return edit;
  const chapter: AnalysisChapterDetail | undefined = chapters.find(
    (item: AnalysisChapterDetail): boolean => item.index === edit.chapterIndex,
  );
  const fact: AnalysisFact | undefined = chapter?.facts.find((item: AnalysisFact): boolean => item.id === edit.factId);
  return { ...edit, base: fact ? factBase(fact) : undefined };
}

async function quoteChapters(
  folder: NovelFolder,
  novel: NovelMetadata,
  edit: OverlayEdit,
): Promise<OccurrenceChapter[]> {
  if (edit.kind !== 'fact-add' && edit.kind !== 'fact-edit') return [];
  const entry: NovelChapterEntry | undefined = novel.chapters[edit.chapterIndex - 1];
  if (!entry) return [];
  return [{ index: edit.chapterIndex, title: entry.title, paragraphs: await readReviewParagraphs(folder, entry.file) }];
}

export async function saveOverlayEdit(
  folder: NovelFolder,
  novel: NovelMetadata,
  edit: OverlayEdit,
  ontology: Ontology,
): Promise<void> {
  const chapters: AnalysisChapterDetail[] = worldFileChapters(readWorldFile(folder), novel.chapters);
  const edits: OverlayEdit[] = overlayEdits(folder);
  const world: World = buildWorld(chapters, { chapter: null, only: false }, edits);
  const saved: OverlayEdit = withBase(edit, chapters);
  const code: ErrorCode | null = checkOverlayEdit({
    edit: saved,
    world,
    ontology,
    chapters: await quoteChapters(folder, novel, saved),
  });
  if (code) throw new CodedError(code, `Overlay edit rejected: ${edit.kind}`);
  await writeWorldOverlay(folder, { version: 1, edits: activeOverlay([...edits, saved]) });
}
