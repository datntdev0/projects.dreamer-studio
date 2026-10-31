import { filterReviewItems, issueCounts, reviewItems } from '@dreamer/shared/core/analysis-review';
import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { editScope, entityOccurrences, findQuoteMatches, OccurrenceChapter } from '@dreamer/shared/core/world';
import { toGraph, WorldModel } from '@dreamer/shared/core/world';
import { applyEdits, ApplyChapter, ApplyOutcome } from '@dreamer/shared/core/world-apply';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisEditRequest, AnalysisPlan, AnalysisRun, AnalysisRunRequest } from '@dreamer/shared/models/analysis';
import { AnalysisIndexFile, ChapterResult, EditProblem, WorldDraftEdit } from '@dreamer/shared/models/analysis';
import { AnalysisStatus } from '@dreamer/shared/models/analysis';
import { OntologyProblem } from '@dreamer/shared/models/analysis';
import { Occurrence } from '@dreamer/shared/models/analysis';
import { OccurrenceQuery } from '@dreamer/shared/models/analysis';
import { QuoteMatch } from '@dreamer/shared/models/analysis';
import { QuoteQuery } from '@dreamer/shared/models/analysis';
import { ReviewPage } from '@dreamer/shared/models/analysis';
import { ReviewQuery } from '@dreamer/shared/models/analysis';
import { World } from '@dreamer/shared/models/analysis';
import { WorldEditPreview } from '@dreamer/shared/models/analysis';
import { WorldEditScope } from '@dreamer/shared/models/analysis';
import { WorldEntity, WorldPreviewRequest, WorldQuery, WorldScopeRequest } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { AppDataSession } from '../../app/app-data-session';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked, novelLocks } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { deleteLegacyWorldFile, readAlignedIndex, readAnalysisIndex, readReviewParagraphs } from './analysis-files';
import { writeAnalysisIndex, writeChapterResult } from './analysis-files';
import { checkOntology, openOntology, resetOntology } from './analysis-ontology';
import { LlmService } from '../llm/llm-service';
import { SettingsStore } from '../settings/settings-store';
import { AnalysisRuns } from './analysis-runs';
import { AnalysisSnapshot, AnalysisSnapshots, modelWith } from './analysis-snapshot';
import { AnalysisRunCheck, checkAnalysisRun } from './world-analysis-pipeline';

export class AnalysisService {
  private readonly observed: WeakSet<AppDataSession> = new WeakSet<AppDataSession>();

  constructor(
    private readonly session: () => AppDataSession,
    private readonly llm: LlmService,
    private readonly settings: SettingsStore,
    private readonly runs: AnalysisRuns,
    private readonly snapshots: AnalysisSnapshots,
  ) {}

  private current(): AppDataSession {
    const session: AppDataSession = this.session();
    if (!this.observed.has(session)) {
      session.executor.onRunFinished((run: PipelineRun): void => {
        if (run.type !== 'world-analysis' || run.novelId === null) return;
        void deleteLegacyWorldFile(this.folder(run.novelId));
        this.runs.clear(run.novelId);
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
    const { novel, snapshot } = await this.snapshot(novelId);
    const run: AnalysisRun | null =
      this.runs.get(novelId) ??
      (this.activeRun(novelId) ? { runningChapter: null, step: 'preparation', done: 0, total: 0, failed: 0 } : null);
    return {
      novelId: novel.id,
      chapters: snapshot.chapters,
      run,
      issues: issueCounts(snapshot.model.issues),
      ontology: snapshot.parsed.ontology,
      ontologyProblems: snapshot.parsed.problems,
      lastRun: readAnalysisIndex(this.folder(novelId))?.lastRun ?? null,
    };
  }

  async plan(request: AnalysisRunRequest): Promise<AnalysisPlan> {
    const session: AppDataSession = this.current();
    const check: AnalysisRunCheck = await checkAnalysisRun(this.llm, this.settings, session.paths, request);
    const blockedReason: ErrorCode | null = novelLocks(new PipelineRunRepository(session.db)).has(request.novelId)
      ? ErrorCode.NovelLocked
      : check.blockedReason;
    const queued: Set<number> = new Set<number>(check.plan.queue);
    const { snapshot } = await this.snapshot(request.novelId);
    return {
      count: check.plan.count,
      edited: snapshot.results.filter((chapter) => queued.has(chapter.index) && !!chapter.result.editedAt).length,
      from: check.plan.from,
      to: check.plan.to,
      batches: check.plan.batches.length,
      blockedReason,
    };
  }

  async start(request: AnalysisRunRequest): Promise<void> {
    const session: AppDataSession = this.current();
    const check: AnalysisRunCheck = await checkAnalysisRun(this.llm, this.settings, session.paths, request);
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
    return toGraph((await this.snapshot(query.novelId)).snapshot.model, query);
  }

  async occurrences(query: OccurrenceQuery): Promise<Occurrence[]> {
    const { snapshot } = await this.snapshot(query.novelId);
    const entity: WorldEntity | undefined = toGraph(snapshot.model, { chapter: null, only: false }).entities.find(
      (item: WorldEntity): boolean => item.id === query.entityId,
    );
    return entity ? entityOccurrences(entity, snapshot.chapterTexts) : [];
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
    const { model, chapterTexts } = (await this.snapshot(query.novelId)).snapshot;
    return {
      items: filterReviewItems(reviewItems(model, chapterTexts), query),
      counts: issueCounts(model.issues),
    };
  }

  async scope(request: WorldScopeRequest): Promise<WorldEditScope> {
    return editScope((await this.snapshot(request.novelId)).snapshot.model, request);
  }

  async preview(request: WorldPreviewRequest): Promise<WorldEditPreview> {
    const { snapshot } = await this.snapshot(request.novelId);
    const outcome: ApplyOutcome = this.apply(snapshot, request.edits);
    if (outcome.problem) return { resolved: false, added: [], problem: outcome.problem };
    const after: WorldModel = modelWith(snapshot, outcome.results);
    const before: Set<string> = new Set<string>(snapshot.model.issues.map((issue): string => issue.key));
    return {
      resolved: request.issueKey ? !after.issues.some((issue): boolean => issue.key === request.issueKey) : true,
      added: after.issues.filter((issue): boolean => !before.has(issue.key)),
      problem: null,
    };
  }

  edit(request: AnalysisEditRequest): Promise<void> {
    const novelId: string = request.novelId;
    return withNovelLock(novelId, async (): Promise<void> => {
      assertUnlocked(new PipelineRunRepository(this.session().db), novelId);
      if (request.edits.length === 0) throw new CodedError(ErrorCode.AnalysisEditInvalid, 'There is no edit to save');
      const { novel, snapshot } = await this.snapshot(novelId);
      const outcome: ApplyOutcome = this.apply(snapshot, request.edits, new Date().toISOString());
      if (outcome.problem) throw editRefused(outcome.problem);
      const folder: NovelFolder = this.folder(novelId);
      for (const result of outcome.results) await writeChapterResult(folder, result);
      const changed: Map<string, ChapterResult> = new Map(outcome.results.map((result) => [result.file, result]));
      const index: AnalysisIndexFile = readAlignedIndex(folder, novel.chapters);
      await writeAnalysisIndex(folder, {
        ...index,
        chapters: index.chapters.map((entry) => {
          const result: ChapterResult | undefined = changed.get(entry.file);
          return result ? { ...entry, counts: chapterCounts(result.entities, result.facts) } : entry;
        }),
      });
      await deleteLegacyWorldFile(folder);
      this.runs.changed(novelId);
    });
  }

  private apply(snapshot: AnalysisSnapshot, edits: WorldDraftEdit[], editedAt: string = ''): ApplyOutcome {
    const texts: Map<number, string[]> = new Map(
      snapshot.chapterTexts.map((chapter): [number, string[]] => [chapter.index, chapter.paragraphs]),
    );
    const chapters: ApplyChapter[] = snapshot.results.map((chapter): ApplyChapter => ({
      index: chapter.index,
      result: chapter.result,
      paragraphs: texts.get(chapter.index) ?? [],
    }));
    return applyEdits({ chapters, entities: snapshot.model.state.entities, edits, editedAt });
  }

  private async snapshot(novelId: string): Promise<{ novel: NovelMetadata; snapshot: AnalysisSnapshot }> {
    const novel: NovelMetadata = this.readNovel(novelId);
    return { novel, snapshot: await this.snapshots.get(this.folder(novelId), novel) };
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

function editRefused(problem: EditProblem): CodedError {
  return new CodedError(
    ErrorCode.AnalysisEditInvalid,
    `World edit refused: ${problem.reason}${problem.word ? ` "${problem.word}"` : ''}`,
    JSON.stringify(problem),
  );
}
