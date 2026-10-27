import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { chapterStatuses, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { applyReviewEdit, chapterReviewStatus, filterReviewItems } from '@dreamer/shared/core/analysis-review';
import { ReviewChapter, reviewEntityOptions, reviewItems } from '@dreamer/shared/core/analysis-review';
import { buildWorld, entityOccurrences, findQuoteMatches, isReviewEdit } from '@dreamer/shared/core/world';
import { OccurrenceChapter, overlayOrphans, WorldScope } from '@dreamer/shared/core/world';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisChannel } from '@dreamer/shared/ipc/channels';
import { AnalysisIndexFile, AnalysisPlan, AnalysisRun, AnalysisRunRequest } from '@dreamer/shared/models/analysis';
import { AnalysisStatus, ChapterAnalysisSummary } from '@dreamer/shared/models/analysis';
import { AnalysisChapterDetail, AnalysisEditRequest } from '@dreamer/shared/models/analysis';
import { AnalysisIndexEntry } from '@dreamer/shared/models/analysis';
import { AnalysisMergeState, ChapterResult, OntologyParseResult } from '@dreamer/shared/models/analysis';
import { OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import { Occurrence, OccurrenceQuery, OverlayEdit, QuoteMatch, QuoteQuery } from '@dreamer/shared/models/analysis';
import { ReviewQuery, World, WorldEdit, WorldEntity, WorldFile, WorldQuery } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { AppDataSession } from '../../app/app-data-session';
import { broadcast } from '../../ipc/broadcast';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked, novelLocks } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { readAnalysisIndex, readChapterParagraphs, readChapterResult, readWorldFile } from './analysis-files';
import { readAlignedIndex } from './analysis-files';
import { readReviewParagraphs } from './analysis-files';
import { overlayEdits, saveOverlayEdit, worldFileChapters } from './analysis-overlay';
import { writeAnalysisIndex, writeChapterResult } from './analysis-files';
import { mergeWorld } from './analysis-merge';
import { readAnalysedChapters, recheckWorld } from './analysis-recheck';
import { checkOntology, loadOntology, openOntology, resetOntology } from './analysis-ontology';
import { AnalysisRuns } from './analysis-runs';
import { AnalysisRunCheck, checkAnalysisRun, WorldAnalysisDeps } from './world-analysis-pipeline';

function isReviewable(chapter: ChapterAnalysisSummary): boolean {
  return chapter.status === 'has-issues' || chapter.status === 'reviewed';
}

function mergeState(chapters: ChapterAnalysisSummary[], index: AnalysisIndexFile | null): AnalysisMergeState {
  return {
    pending: chapters.filter((chapter: ChapterAnalysisSummary): boolean => chapter.pending).length,
    openIssues: index?.issues?.open ?? 0,
    openErrors: index?.issues?.errors ?? 0,
    mergedAt: index?.mergedAt ?? null,
  };
}

function worldOf(chapters: AnalysisChapterDetail[], edits: OverlayEdit[], scope: WorldScope): World {
  return buildWorld(chapters, scope, edits);
}

export class AnalysisService {
  private readonly observed: WeakSet<AppDataSession> = new WeakSet<AppDataSession>();

  constructor(
    private readonly session: () => AppDataSession,
    private readonly deps: WorldAnalysisDeps,
  ) {}

  private get runs(): AnalysisRuns {
    return this.deps.runs;
  }

  private current(): AppDataSession {
    const session: AppDataSession = this.session();
    if (!this.observed.has(session)) {
      session.executor.onRunFinished((run: PipelineRun): void => {
        if (run.type === 'world-analysis' && run.novelId !== null) this.runs.clear(run.novelId);
      });
      this.observed.add(session);
    }
    return session;
  }

  private activeRun(novelId: string): PipelineRun | undefined {
    return new PipelineRunRepository(this.current().db)
      .activeNovelRuns()
      .find((run: PipelineRun): boolean => run.type === 'world-analysis' && run.novelId === novelId);
  }

  async status(novelId: string): Promise<AnalysisStatus> {
    const novel: NovelMetadata = this.readNovel(novelId);
    const folder: NovelFolder = this.folder(novelId);
    const parsed: OntologyParseResult = loadOntology(folder);
    const index: AnalysisIndexFile | null = readAnalysisIndex(folder);
    const chapters: ChapterAnalysisSummary[] = chapterStatuses(novel.chapters, index);
    const run: AnalysisRun | null =
      this.runs.get(novelId) ??
      (this.activeRun(novelId) ? { runningChapter: null, step: 'preparation', done: 0, total: 0, failed: 0 } : null);
    return {
      novelId,
      chapters,
      run,
      merge: mergeState(chapters, index),
      ontology: parsed.ontology,
      ontologyProblems: parsed.problems,
      lastRun: index?.lastRun ?? null,
    };
  }

  async plan(request: AnalysisRunRequest): Promise<AnalysisPlan> {
    const session: AppDataSession = this.current();
    const check: AnalysisRunCheck = await checkAnalysisRun(this.deps, session.paths, request);
    const blockedReason: ErrorCode | null = novelLocks(new PipelineRunRepository(session.db)).has(request.novelId)
      ? ErrorCode.NovelLocked
      : check.blockedReason;
    return {
      count: check.plan.count,
      from: check.plan.from,
      to: check.plan.to,
      batches: check.plan.batches.length,
      blockedReason,
    };
  }

  async start(request: AnalysisRunRequest): Promise<void> {
    const session: AppDataSession = this.current();
    const check: AnalysisRunCheck = await checkAnalysisRun(this.deps, session.paths, request);
    if (check.blockedReason)
      throw new CodedError(check.blockedReason, `World Analysis cannot run: ${check.blockedReason}`);
    const novel: NovelMetadata = this.readNovel(request.novelId);
    assertUnlocked(new PipelineRunRepository(session.db), request.novelId);
    session.executor.startRun('world-analysis', { ...request }, novel.title, request.novelId);
    this.runs.set(request.novelId, {
      runningChapter: null,
      step: 'preparation',
      done: 0,
      total: check.plan.count,
      failed: 0,
    });
  }

  cancel(novelId: string): void {
    const run: PipelineRun | undefined = this.activeRun(novelId);
    if (run) this.current().executor.cancel(run.id);
  }

  ontologyOpen(novelId: string): Promise<void> {
    return withNovelLock(novelId, async (): Promise<void> => {
      this.readNovel(novelId);
      await openOntology(this.folder(novelId));
    });
  }

  async ontologyCheck(novelId: string): Promise<OntologyProblem[]> {
    this.readNovel(novelId);
    return checkOntology(this.folder(novelId));
  }

  ontologyReset(novelId: string): Promise<OntologyProblem[]> {
    return withNovelLock(novelId, async (): Promise<OntologyProblem[]> => {
      this.readNovel(novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), novelId);
      return resetOntology(this.folder(novelId));
    });
  }

  async world(query: WorldQuery): Promise<World> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const folder: NovelFolder = this.folder(query.novelId);
    const file: WorldFile | null = readWorldFile(folder);
    const chapters: AnalysisChapterDetail[] = worldFileChapters(file, novel.chapters);
    const edits: OverlayEdit[] = overlayEdits(folder);
    return {
      ...worldOf(chapters, edits, query),
      orphans: overlayOrphans(chapters, edits),
      mergedAt: file?.mergedAt ?? null,
    };
  }

  async occurrences(query: OccurrenceQuery): Promise<Occurrence[]> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const folder: NovelFolder = this.folder(query.novelId);
    const details: AnalysisChapterDetail[] = worldFileChapters(readWorldFile(folder), novel.chapters);
    const world: World = worldOf(details, overlayEdits(folder), { chapter: null, only: false });
    const entity: WorldEntity | undefined = world.entities.find(
      (item: WorldEntity): boolean => item.id === query.entityId,
    );
    if (!entity) return [];
    const chapters: OccurrenceChapter[] = [];
    for (const chapter of details.filter((item: AnalysisChapterDetail): boolean =>
      entity.chapters.includes(item.index),
    )) {
      const paragraphs: string[] = await readReviewParagraphs(folder, chapter.file);
      chapters.push({ index: chapter.index, title: chapter.title, paragraphs });
    }
    return entityOccurrences(entity, chapters);
  }

  async findQuote(query: QuoteQuery): Promise<QuoteMatch[]> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const folder: NovelFolder = this.folder(query.novelId);
    const chapters: OccurrenceChapter[] = [];
    for (const [position, entry] of novel.chapters.entries()) {
      const paragraphs: string[] = await readReviewParagraphs(folder, entry.file);
      chapters.push({ index: position + 1, title: entry.title, paragraphs });
    }
    return findQuoteMatches(chapters, query.quote);
  }

  async review(query: ReviewQuery): Promise<ReviewPage> {
    const folder: NovelFolder = this.folder(query.novelId);
    const status: AnalysisStatus = await this.status(query.novelId);
    const chapters: ReviewChapter[] = [];
    const listed: ReviewChapter[] = [];
    for (const { chapter, result } of readAnalysedChapters(folder, status.chapters)) {
      const reviewable: boolean = isReviewable(chapter);
      const paragraphs: string[] = reviewable ? await readReviewParagraphs(folder, chapter.file) : [];
      const item: ReviewChapter = { ...chapter, paragraphs, entities: result.entities, facts: result.facts };
      chapters.push(item);
      if (reviewable) listed.push(item);
    }
    return {
      items: filterReviewItems(reviewItems(chapters), query),
      openCount: status.merge.openIssues,
      entities: reviewEntityOptions(listed),
    };
  }

  edit(request: AnalysisEditRequest): Promise<void> {
    const edit: WorldEdit = request.edit;
    const novelId: string = request.novelId;
    if (!isReviewEdit(edit)) return this.overlayEdit(novelId, edit);
    return withNovelLock(novelId, async (): Promise<void> => {
      const novel: NovelMetadata = this.readNovel(novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), novelId);
      const folder: NovelFolder = this.folder(novelId);
      const index: AnalysisIndexFile = readAlignedIndex(folder, novel.chapters);
      const chapter: ChapterAnalysisSummary | undefined = chapterStatuses(novel.chapters, index)[edit.chapterIndex - 1];
      const result: ChapterResult | null =
        chapter && isReviewable(chapter) ? readChapterResult(folder, chapter.file) : null;
      const entry: AnalysisIndexEntry | undefined = index.chapters.find(
        (candidate: AnalysisIndexEntry): boolean => candidate.file === chapter?.file,
      );
      if (!chapter || !result || !entry)
        throw new CodedError(ErrorCode.AnalysisEditInvalid, `Chapter ${edit.chapterIndex} cannot be edited`);
      const edited = applyReviewEdit({
        chapter: { index: chapter.index, paragraphs: await readChapterParagraphs(folder, chapter.file) },
        entities: result.entities,
        facts: result.facts,
        edit,
        ontology: loadOntology(folder).ontology,
      });
      await writeChapterResult(folder, { ...result, ...edited });
      await writeAnalysisIndex(
        folder,
        upsertIndexEntry(index, {
          ...entry,
          status: chapterReviewStatus(edited.entities, edited.facts),
          counts: chapterCounts(edited.entities, edited.facts),
          updatedAt: new Date().toISOString(),
        }),
      );
      await recheckWorld(folder, novel);
      broadcast(AnalysisChannel.Changed, { novelId });
    });
  }

  private overlayEdit(novelId: string, edit: OverlayEdit): Promise<void> {
    return withNovelLock(novelId, async (): Promise<void> => {
      const novel: NovelMetadata = this.readNovel(novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), novelId);
      const folder: NovelFolder = this.folder(novelId);
      await saveOverlayEdit(folder, novel, edit, loadOntology(folder).ontology);
      broadcast(AnalysisChannel.Changed, { novelId });
    });
  }

  merge(novelId: string): Promise<void> {
    return withNovelLock(novelId, async (): Promise<void> => {
      const novel: NovelMetadata = this.readNovel(novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), novelId);
      const folder: NovelFolder = this.folder(novelId);
      await recheckWorld(folder, novel);
      const index: AnalysisIndexFile = readAlignedIndex(folder, novel.chapters);
      await mergeWorld(folder, chapterStatuses(novel.chapters, index), index);
      broadcast(AnalysisChannel.Changed, { novelId });
    });
  }

  private readNovel(novelId: string): NovelMetadata {
    const metadata: NovelMetadata | null = readMetadata(this.folder(novelId));
    if (metadata === null) {
      throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
    }
    return metadata;
  }

  private folder(novelId: string): NovelFolder {
    return novelFolder(this.current().paths, novelId);
  }
}
