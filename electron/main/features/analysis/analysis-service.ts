import { chapterStatuses } from '@dreamer/shared/core/analysis-plan';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisIndexFile, AnalysisPlan, AnalysisRun, AnalysisRunRequest } from '@dreamer/shared/models/analysis';
import { AnalysisStatus, ChapterAnalysisSummary } from '@dreamer/shared/models/analysis';
import { OntologyParseResult } from '@dreamer/shared/models/analysis';
import { OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import { ReviewQuery, World, WorldQuery } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { AppDataSession } from '../../app/app-data-session';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked, novelLocks } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { readAnalysisIndex } from './analysis-files';
import { checkOntology, loadOntology, openOntology, resetOntology } from './analysis-ontology';
import { AnalysisRuns } from './analysis-runs';
import { AnalysisRunCheck, checkAnalysisRun, WorldAnalysisDeps } from './world-analysis-pipeline';

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
      merge: { pending: 0, openIssues: 0, mergedAt: null },
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
    this.readNovel(query.novelId);
    return { entities: [], links: [], mergedAt: null };
  }

  async review(query: ReviewQuery): Promise<ReviewPage> {
    this.readNovel(query.novelId);
    return { items: [], openCount: 0, failedChapters: [] };
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
