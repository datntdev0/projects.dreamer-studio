import { DestroyRef, inject, provideAppInitializer, type EnvironmentProviders, type Provider } from '@angular/core';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { isUpToDate } from '@dreamer/shared/core/analysis-plan';
import { filterReviewItems, issueCounts, reviewItems } from '@dreamer/shared/core/analysis-review';
import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { buildModel, editScope, entityOccurrences, findQuoteMatches, toGraph } from '@dreamer/shared/core/world';
import { applyEdits } from '@dreamer/shared/core/world-apply';
import type { ApplyChapter, ApplyOutcome } from '@dreamer/shared/core/world-apply';
import type { WorldModel, WorldSource } from '@dreamer/shared/core/world';
import type {
  AnalysisChanged,
  AnalysisChapterDetail,
  AnalysisChapterRequest,
  AnalysisEditRequest,
  AnalysisPlan,
  AnalysisProgress,
  AnalysisRun,
  AnalysisRunRequest,
  AnalysisStatus,
  ChapterAnalysisSummary,
  Occurrence,
  OccurrenceQuery,
  OntologyProblem,
  QuoteMatch,
  QuoteQuery,
  ReviewPage,
  ReviewQuery,
  World,
  WorldDraftEdit,
  ChapterResult,
  WorldEditPreview,
  WorldEditScope,
  WorldPreviewRequest,
  WorldQuery,
  WorldScopeRequest,
} from '@dreamer/shared/models/analysis';
import type {
  ChapterRequest,
  ChapterText,
  LibraryChangedEvent,
  NovelDetail,
  NovelSummary,
} from '@dreamer/shared/models/novel';
import { DesktopApi } from '@core/desktop-api';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { SettingsStore } from '@core/stores/settings-store';
import {
  DEFAULT_ONTOLOGY,
  JADE_RIVER_NOVEL,
  ONTOLOGY_PROBLEMS,
  UNANALYSED_CHAPTERS,
  UNANALYSED_NOVEL,
  jadeRiverChapters,
  jadeRiverNovel,
} from './analysis';
import type { ChapterAnalysis, JadeRiverEdition } from './analysis';
import { toNovelSummary } from './library';
import { fakeLlmApi, fakeSettingsApi } from './desktop-api';
import { FakePipelinesApi } from './pipelines-api';

export type AnalysisScenario =
  'normal' | 'emptyLibrary' | 'notAnalysed' | 'noLlm' | 'invalidOntology' | 'locked' | 'running';

const STEPS: AnalysisRun['step'][] = ['preparation', 'candidates', 'predicates', 'verification'];
const TICK_MS = 280;

export class FakeAnalysisApi extends FakePipelinesApi {
  private readonly chapters = new Map<string, ChapterAnalysis[]>();
  private readonly changedListeners = new Set<(event: AnalysisChanged) => void>();
  private readonly progressListeners = new Set<(progress: AnalysisProgress) => void>();
  private readonly libraryListeners = new Set<(event: LibraryChangedEvent) => void>();
  private readonly activeRuns = new Map<string, AnalysisRun>();
  private readonly queues = new Map<string, number[]>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private invalidOntology: boolean;

  constructor(
    private readonly scenario: AnalysisScenario,
    destroyRef: DestroyRef,
    private readonly edition: JadeRiverEdition = 'en',
  ) {
    super({ runs: [] }, destroyRef);
    this.invalidOntology = scenario === 'invalidOntology';
    const novelId = JADE_RIVER_NOVEL.id;
    this.chapters.set(
      novelId,
      jadeRiverChapters(edition).map((chapter) => ({ ...chapter })),
    );
    this.chapters.set(
      UNANALYSED_NOVEL.id,
      UNANALYSED_CHAPTERS.map((chapter) => ({ ...chapter })),
    );
    destroyRef.onDestroy(() => this.timers.forEach((timer) => clearInterval(timer)));
    if (scenario === 'running') {
      const queue = this.chapters
        .get(novelId)!
        .filter((chapter) => !isUpToDate(chapter.status))
        .map((chapter) => chapter.index);
      this.beginRun(novelId, queue);
    }
  }

  override async listNovels(): Promise<NovelSummary[]> {
    if (this.scenario === 'emptyLibrary') return [];
    const novels =
      this.scenario === 'notAnalysed' ? [UNANALYSED_NOVEL] : [jadeRiverNovel(this.edition), UNANALYSED_NOVEL];
    return novels.map((novel) => ({
      ...toNovelSummary(novel),
      lock:
        this.scenario === 'locked'
          ? { runId: 'story-lock', type: 'novel-export', label: novel.title, status: 'running' }
          : null,
    }));
  }

  override async getNovel(id: string): Promise<NovelDetail | null> {
    const novel = [jadeRiverNovel(this.edition), UNANALYSED_NOVEL].find((item) => item.id === id);
    if (!novel) throw new CodedError(ErrorCode.NovelNotFound, `Novel ${id} was not found`);
    const summary = (await this.listNovels()).find((item) => item.id === id) ?? toNovelSummary(novel);
    return {
      ...summary,
      description: novel.description,
      chapters: (this.chapters.get(id) ?? []).map((chapter) => ({
        position: chapter.index,
        title: chapter.title,
        file: chapter.file,
        paragraphs: chapter.paragraphs.length,
        chars: chapter.paragraphs.join('\n').length,
      })),
    };
  }

  override async getChapter(request: ChapterRequest): Promise<ChapterText | null> {
    return {
      paragraphs:
        this.chapters.get(request.novelId)?.find((chapter) => chapter.file === request.file)?.paragraphs ?? [],
    };
  }

  override onLibraryChanged(listener: (event: LibraryChangedEvent) => void): () => void {
    this.libraryListeners.add(listener);
    return () => this.libraryListeners.delete(listener);
  }

  override async analysisStatus(novelId: string): Promise<AnalysisStatus | null> {
    const chapters = (this.chapters.get(novelId) ?? []).map((chapter): ChapterAnalysisSummary => {
      const { index, title, file, resultFile, status, counts, error } = chapter;
      return { index, title, file, resultFile, status, counts, error };
    });
    return {
      novelId,
      chapters,
      run: this.activeRuns.get(novelId) ?? null,
      issues: issueCounts(this.model(novelId).issues),
      ontology: DEFAULT_ONTOLOGY,
      ontologyProblems: this.invalidOntology ? ONTOLOGY_PROBLEMS : [],
      lastRun: null,
    };
  }

  override async analysisChapter(request: AnalysisChapterRequest): Promise<AnalysisChapterDetail | null> {
    const chapter = this.chapters.get(request.novelId)?.find((item) => item.file === request.file);
    return chapter ?? null;
  }

  override async analysisPlan(request: AnalysisRunRequest): Promise<AnalysisPlan | null> {
    const blockedReason =
      this.scenario === 'locked'
        ? 'NOVEL_LOCKED'
        : this.invalidOntology
          ? 'ONTOLOGY_INVALID'
          : this.scenario === 'noLlm'
            ? 'LLM_UNAVAILABLE'
            : null;
    const queue = await this.runQueue(request);
    return {
      count: queue.length,
      edited: 0,
      from: queue.length ? Math.min(...queue) : null,
      to: queue.length ? Math.max(...queue) : null,
      batches: Math.ceil(queue.length / Math.max(1, request.batchSize)),
      blockedReason: blockedReason ?? (queue.length ? null : 'ANALYSIS_NOTHING_TO_RUN'),
    };
  }

  override async startAnalysis(request: AnalysisRunRequest): Promise<void> {
    const plan = await this.analysisPlan(request);
    if (plan?.blockedReason) throw new Error(plan.blockedReason);
    this.beginRun(request.novelId, await this.runQueue(request));
  }

  private async runQueue(request: AnalysisRunRequest): Promise<number[]> {
    const status = await this.analysisStatus(request.novelId);
    const overwrite = request.overwrite && request.mode !== 'missing';
    return (status?.chapters ?? [])
      .filter((chapter) => this.inRange(chapter, request) && (overwrite || !isUpToDate(chapter.status)))
      .map((chapter) => chapter.index);
  }

  override async cancelAnalysis(novelId: string): Promise<void> {
    this.stopRun(novelId);
  }

  override async analysisWorld(query: WorldQuery): Promise<World | null> {
    return toGraph(this.model(query.novelId), { chapter: query.chapter, only: query.only });
  }

  override async analysisReview(query: ReviewQuery): Promise<ReviewPage | null> {
    const model = this.model(query.novelId);
    const items = reviewItems(model, this.chapters.get(query.novelId) ?? []);
    return { items: filterReviewItems(items, query), counts: issueCounts(model.issues) };
  }

  override async analysisScope(request: WorldScopeRequest): Promise<WorldEditScope | null> {
    return editScope(this.model(request.novelId), request);
  }

  override async analysisPreview(request: WorldPreviewRequest): Promise<WorldEditPreview | null> {
    const outcome = this.apply(request.novelId, request.edits);
    if (outcome.problem) return { resolved: false, added: [], problem: outcome.problem };
    const before = this.model(request.novelId);
    const after = this.model(request.novelId, outcome.results);
    const known = new Set(before.issues.map((issue) => issue.key));
    return {
      resolved: request.issueKey ? !after.issues.some((issue) => issue.key === request.issueKey) : true,
      added: after.issues.filter((issue) => !known.has(issue.key)),
      problem: null,
    };
  }

  override async analysisOccurrences(query: OccurrenceQuery): Promise<Occurrence[]> {
    const world = toGraph(this.model(query.novelId), { chapter: null, only: false });
    const entity = world.entities.find((item) => item.id === query.entityId);
    return entity ? entityOccurrences(entity, this.chapters.get(query.novelId) ?? []) : [];
  }

  override async analysisEdit(request: AnalysisEditRequest): Promise<void> {
    const { novelId, edits } = request;
    this.assertFree(novelId);
    const outcome = this.apply(novelId, edits, new Date().toISOString());
    if (outcome.problem) throw new CodedError(ErrorCode.AnalysisEditInvalid, outcome.problem.reason);
    this.chapters.set(novelId, this.withResults(novelId, outcome.results));
    this.emitChanged(novelId);
  }

  override async analysisFindQuote(query: QuoteQuery): Promise<QuoteMatch[]> {
    return findQuoteMatches(this.chapters.get(query.novelId) ?? [], query.quote);
  }

  override async analysisOntologyOpen(): Promise<void> {}

  override async analysisOntologyReset(novelId: string): Promise<OntologyProblem[]> {
    this.invalidOntology = false;
    this.emitChanged(novelId);
    return [];
  }

  override async analysisOntologyCheck(): Promise<OntologyProblem[]> {
    return this.invalidOntology ? ONTOLOGY_PROBLEMS : [];
  }

  override onAnalysisProgress(listener: (progress: AnalysisProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  override onAnalysisChanged(listener: (event: AnalysisChanged) => void): () => void {
    this.changedListeners.add(listener);
    return () => this.changedListeners.delete(listener);
  }

  private inRange(chapter: ChapterAnalysisSummary, request: AnalysisRunRequest): boolean {
    return (
      request.mode !== 'range' ||
      (chapter.index >= (request.from ?? 1) && chapter.index <= (request.to ?? Number.MAX_SAFE_INTEGER))
    );
  }

  private beginRun(novelId: string, queue: number[]): void {
    if (this.activeRuns.has(novelId) || queue.length === 0) return;
    this.queues.set(novelId, queue);
    this.activeRuns.set(novelId, {
      runningChapter: queue[0],
      step: 'preparation',
      done: 0,
      total: queue.length,
      failed: 0,
    });
    this.emitProgress(novelId);
    this.timers.set(
      novelId,
      setInterval(() => this.advanceRun(novelId), TICK_MS),
    );
  }

  private advanceRun(novelId: string): void {
    const run = this.activeRuns.get(novelId);
    const queue = this.queues.get(novelId);
    if (!run || !queue) return;
    const nextStep = STEPS.indexOf(run.step) + 1;
    if (nextStep < STEPS.length) run.step = STEPS[nextStep];
    else {
      const chapter = this.chapters.get(novelId)?.find((item) => item.index === run.runningChapter);
      if (chapter) this.replaceResult(chapter);
      run.done += 1;
      if (run.done >= queue.length) {
        this.stopRun(novelId);
        return;
      }
      run.runningChapter = queue[run.done];
      run.step = 'preparation';
    }
    this.emitProgress(novelId);
  }

  private replaceResult(chapter: ChapterAnalysis): void {
    chapter.status = 'analysed';
    chapter.resultFile = chapter.file;
    chapter.error = undefined;
  }

  private stopRun(novelId: string): void {
    const timer = this.timers.get(novelId);
    if (timer) clearInterval(timer);
    this.timers.delete(novelId);
    this.queues.delete(novelId);
    this.activeRuns.delete(novelId);
    this.emitChanged(novelId);
  }

  private emitProgress(novelId: string): void {
    const run = this.activeRuns.get(novelId);
    if (run)
      this.progressListeners.forEach((listener) =>
        listener({
          novelId,
          chapter: run.runningChapter,
          step: run.step,
          done: run.done,
          total: run.total,
          failed: run.failed,
        }),
      );
  }

  private emitChanged(novelId: string): void {
    this.changedListeners.forEach((listener) => listener({ novelId }));
    this.libraryListeners.forEach((listener) => listener({ novelIds: [novelId] }));
  }

  private assertFree(novelId: string): void {
    if (this.scenario === 'locked' || this.activeRuns.has(novelId))
      throw new CodedError(ErrorCode.NovelLocked, 'Novel is busy');
  }

  private apply(novelId: string, edits: WorldDraftEdit[], editedAt = ''): ApplyOutcome {
    const chapters = (this.chapters.get(novelId) ?? [])
      .filter((chapter) => chapter.resultFile && (chapter.status === 'analysed' || chapter.status === 'stale'))
      .map((chapter): ApplyChapter => ({
        index: chapter.index,
        paragraphs: chapter.paragraphs,
        result: {
          version: 1,
          file: chapter.file,
          index: chapter.index,
          title: chapter.title,
          analysedAt: '',
          llm: '',
          entities: chapter.entities,
          facts: chapter.facts,
        },
      }));
    return applyEdits({ chapters, entities: this.model(novelId).state.entities, edits, editedAt });
  }

  private withResults(novelId: string, results: ChapterResult[]): ChapterAnalysis[] {
    return (this.chapters.get(novelId) ?? []).map((chapter) => {
      const result = results.find((item) => item.file === chapter.file);
      return result
        ? {
            ...chapter,
            entities: result.entities,
            facts: result.facts,
            counts: chapterCounts(result.entities, result.facts),
          }
        : chapter;
    });
  }

  private model(novelId: string, results: ChapterResult[] = []): WorldModel {
    const chapters = this.withResults(novelId, results);
    const sources = chapters
      .filter((chapter) => chapter.resultFile && (chapter.status === 'analysed' || chapter.status === 'stale'))
      .map((chapter): WorldSource => ({ ...chapter, stale: chapter.status === 'stale' }));
    return buildModel({
      sources,
      ontology: DEFAULT_ONTOLOGY,
      texts: chapters,
    });
  }
}

export function provideFakeAnalysisApi(scenario: AnalysisScenario): (Provider | EnvironmentProviders)[] {
  const novelId =
    scenario === 'emptyLibrary' ? null : scenario === 'notAnalysed' ? UNANALYSED_NOVEL.id : JADE_RIVER_NOVEL.id;
  return [
    {
      provide: DesktopApi,
      useFactory: () =>
        Object.assign(
          new FakeAnalysisApi(scenario, inject(DestroyRef)),
          fakeSettingsApi({
            llm: {
              paths: {},
              default: scenario === 'noLlm' ? null : { cli: 'claude', model: null },
              features: {},
            },
          }),
          fakeLlmApi(scenario === 'noLlm' ? 'none' : 'mixed'),
        ),
    },
    provideAppInitializer(() => inject(SettingsStore).load()),
    provideAppInitializer(() => inject(CurrentNovelStore).select(novelId)),
  ];
}
