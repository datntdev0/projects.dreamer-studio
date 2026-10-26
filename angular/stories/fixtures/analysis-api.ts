import { DestroyRef, inject, provideAppInitializer, type EnvironmentProviders, type Provider } from '@angular/core';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { applyReviewEdits, buildWorld, isReviewEdit } from '@dreamer/shared/core/world';
import { findTextContext } from '@dreamer/shared/core/text-match';
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
  ChapterAnalysis,
  ChapterAnalysisStatus,
  ChapterAnalysisSummary,
  Occurrence,
  OccurrenceQuery,
  OntologyProblem,
  OverlayEdit,
  QuoteMatch,
  QuoteQuery,
  ReviewEdit,
  ReviewItem,
  ReviewPage,
  ReviewQuery,
  World,
  WorldQuery,
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
  JADE_RIVER_PENDING,
  JADE_RIVER_REVIEW_EDITS,
  ONTOLOGY_PROBLEMS,
  UNANALYSED_CHAPTERS,
  UNANALYSED_NOVEL,
  jadeRiverChapters,
  jadeRiverNovel,
  jadeRiverOverlay,
} from './analysis';
import type { JadeRiverEdition } from './analysis';
import { toNovelSummary } from './library';
import { fakeLlmApi, fakeSettingsApi } from './desktop-api';
import { FakePipelinesApi } from './pipelines-api';

export type AnalysisScenario =
  'normal' | 'readyToMerge' | 'emptyLibrary' | 'notAnalysed' | 'noLlm' | 'invalidOntology' | 'locked' | 'running';

const STEPS: AnalysisRun['step'][] = ['preparation', 'candidates', 'predicates', 'verification'];
const TICK_MS = 280;
const DONE: ChapterAnalysisStatus[] = ['clean', 'has-issues', 'reviewed'];
const READY_TO_MERGE_EDITS: ReviewEdit[] = [
  { kind: 'review-accept', chapterIndex: 26, itemKind: 'fact', itemId: 'c26-missing-quote' },
  { kind: 'review-reject', chapterIndex: 27, itemKind: 'entity', itemId: 'invalid-crown' },
];

export class FakeAnalysisApi extends FakePipelinesApi {
  private readonly chapters = new Map<string, ChapterAnalysis[]>();
  private readonly reviewEdits = new Map<string, ReviewEdit[]>();
  private readonly overlay = new Map<string, OverlayEdit[]>();
  private readonly merged = new Map<string, AnalysisChapterDetail[]>();
  private readonly pending = new Map<string, Set<number>>();
  private readonly mergedAt = new Map<string, string>();
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
    this.reviewEdits.set(novelId, [
      ...JADE_RIVER_REVIEW_EDITS,
      ...(scenario === 'readyToMerge' ? READY_TO_MERGE_EDITS : []),
    ]);
    this.overlay.set(novelId, jadeRiverOverlay(edition));
    this.pending.set(novelId, new Set(JADE_RIVER_PENDING));
    this.merged.set(novelId, this.snapshot(novelId));
    this.mergedAt.set(novelId, '2026-10-24T09:15:00.000Z');
    destroyRef.onDestroy(() => this.timers.forEach((timer) => clearInterval(timer)));
    if (scenario === 'running') {
      const queue = this.chapters
        .get(novelId)!
        .filter((chapter) => !DONE.includes(chapter.status))
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
    const pending = this.pending.get(novelId) ?? new Set<number>();
    const chapters = (this.chapters.get(novelId) ?? []).map((chapter): ChapterAnalysisSummary => {
      const detail = this.reviewed(novelId, chapter);
      const items = [...detail.entities, ...detail.facts];
      const counts = {
        entities: detail.entities.length,
        facts: detail.facts.length,
        verified: items.filter((item) => item.status === 'verified').length,
        failed: items.filter((item) => item.status === 'failed').length,
        accepted: items.filter((item) => item.status === 'accepted').length,
        rejected: items.filter((item) => item.status === 'rejected').length,
      };
      const { index, title, file, resultFile, error } = chapter;
      const status = this.chapterStatus(chapter, counts.failed);
      return { index, title, file, resultFile, status, counts, pending: pending.has(index), error };
    });
    const withIssues = chapters.filter((chapter) => chapter.status === 'has-issues');
    return {
      novelId,
      chapters,
      run: this.activeRuns.get(novelId) ?? null,
      merge: {
        pending: pending.size,
        openIssues: withIssues.reduce((sum, chapter) => sum + chapter.counts.failed, 0),
        mergedAt: this.mergedAt.get(novelId) ?? null,
      },
      ontology: DEFAULT_ONTOLOGY,
      ontologyProblems: this.invalidOntology ? ONTOLOGY_PROBLEMS : [],
    };
  }

  override async analysisChapter(request: AnalysisChapterRequest): Promise<AnalysisChapterDetail | null> {
    const chapter = this.chapters.get(request.novelId)?.find((item) => item.file === request.file);
    return chapter ? this.reviewed(request.novelId, chapter) : null;
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
      .filter((chapter) => this.inRange(chapter, request) && (overwrite || !DONE.includes(chapter.status)))
      .map((chapter) => chapter.index);
  }

  override async cancelAnalysis(novelId: string): Promise<void> {
    this.stopRun(novelId);
  }

  override async analysisWorld(query: WorldQuery): Promise<World | null> {
    return {
      ...buildWorld(
        this.merged.get(query.novelId) ?? [],
        { chapter: query.chapter, only: query.only },
        this.overlay.get(query.novelId) ?? [],
      ),
      mergedAt: this.mergedAt.get(query.novelId) ?? null,
    };
  }

  override async analysisReview(query: ReviewQuery): Promise<ReviewPage | null> {
    const status = await this.analysisStatus(query.novelId);
    const chapters = status?.chapters ?? [];
    const items: ReviewItem[] = [];
    for (const chapter of chapters.filter((item) => item.status === 'has-issues' || item.status === 'reviewed')) {
      const raw = this.chapters.get(query.novelId)?.find((item) => item.index === chapter.index);
      if (!raw) continue;
      const issues = new Set(this.issueIds(raw));
      const detail = this.reviewed(query.novelId, raw);
      const name = (id: string | undefined): string => detail.entities.find((entity) => entity.id === id)?.name ?? '';
      const chapterItems: ReviewItem[] = [
        ...detail.entities.map((entity) => ({
          chapterIndex: chapter.index,
          chapterTitle: chapter.title,
          itemKind: 'entity' as const,
          entity,
          context: findTextContext(detail.paragraphs, entity.wordsFound[0] ?? entity.name),
        })),
        ...detail.facts.map((fact) => ({
          chapterIndex: chapter.index,
          chapterTitle: chapter.title,
          itemKind: 'fact' as const,
          fact,
          subjectName: name(fact.subjectId),
          objectName: name(fact.objectId),
          context: fact.quote ? findTextContext(detail.paragraphs, fact.quote) : null,
        })),
      ];
      items.push(...chapterItems.filter((item) => issues.has(this.itemId(item)) && this.matchesReview(item, query)));
    }
    return {
      items,
      openCount: status?.merge.openIssues ?? 0,
      failedChapters: chapters.filter((item) => item.status === 'failed'),
    };
  }

  override async analysisOccurrences(query: OccurrenceQuery): Promise<Occurrence[]> {
    const world = await this.analysisWorld({ novelId: query.novelId, chapter: null, only: false });
    const entity = world?.entities.find((item) => item.id === query.entityId);
    if (!entity) return [];
    const chapters = this.chapters.get(query.novelId) ?? [];
    return entity.chapters.map((index) => {
      const chapter = chapters.find((item) => item.index === index);
      const context =
        [entity.name, ...entity.aliases]
          .map((needle) => findTextContext(chapter?.paragraphs ?? [], needle))
          .find((item) => item !== null) ?? null;
      return { chapterIndex: index, chapterTitle: chapter?.title ?? '', context };
    });
  }

  override async analysisEdit(request: AnalysisEditRequest): Promise<void> {
    const { novelId, edit } = request;
    this.assertFree(novelId);
    if (isReviewEdit(edit)) this.reviewEdits.set(novelId, [...(this.reviewEdits.get(novelId) ?? []), edit]);
    else this.overlay.set(novelId, [...(this.overlay.get(novelId) ?? []), edit]);
    this.emitChanged(novelId);
  }

  override async analysisMerge(novelId: string): Promise<void> {
    this.assertFree(novelId);
    const openIssues = (await this.analysisStatus(novelId))?.merge.openIssues ?? 0;
    if (openIssues) throw new CodedError(ErrorCode.AnalysisOpenIssues, `${openIssues} issues are still open`);
    this.pending.set(novelId, new Set());
    this.merged.set(novelId, this.snapshot(novelId));
    this.mergedAt.set(novelId, new Date().toISOString());
    this.emitChanged(novelId);
  }

  override async analysisFindQuote(query: QuoteQuery): Promise<QuoteMatch[]> {
    const quote = query.quote.trim();
    if (!quote) return [];
    return (this.chapters.get(query.novelId) ?? []).flatMap((chapter) => {
      const context = findTextContext(chapter.paragraphs, quote);
      return context ? [{ chapterIndex: chapter.index, chapterTitle: chapter.title, context }] : [];
    });
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
      if (chapter) this.replaceResult(novelId, chapter);
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

  private replaceResult(novelId: string, chapter: ChapterAnalysis): void {
    chapter.status = 'clean';
    chapter.resultFile = chapter.file;
    chapter.error = undefined;
    const edits = this.reviewEdits.get(novelId) ?? [];
    this.reviewEdits.set(
      novelId,
      edits.filter((edit) => edit.chapterIndex !== chapter.index),
    );
    this.pending.get(novelId)?.add(chapter.index);
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

  private reviewed(novelId: string, chapter: ChapterAnalysis): AnalysisChapterDetail {
    return applyReviewEdits(chapter, this.reviewEdits.get(novelId) ?? []);
  }

  private snapshot(novelId: string): AnalysisChapterDetail[] {
    const pending = this.pending.get(novelId) ?? new Set<number>();
    return (this.chapters.get(novelId) ?? [])
      .filter((chapter) => chapter.resultFile && chapter.status !== 'failed' && !pending.has(chapter.index))
      .map((chapter) => this.reviewed(novelId, chapter));
  }

  private chapterStatus(chapter: ChapterAnalysis, failed: number): ChapterAnalysisStatus {
    if (!DONE.includes(chapter.status)) return chapter.status;
    if (failed) return 'has-issues';
    return this.issueIds(chapter).length ? 'reviewed' : 'clean';
  }

  private issueIds(chapter: ChapterAnalysis): string[] {
    return [...chapter.entities, ...chapter.facts].filter((item) => item.status === 'failed').map((item) => item.id);
  }

  private itemId(item: ReviewItem): string {
    return item.entity?.id ?? item.fact?.id ?? '';
  }

  private itemStatus(item: ReviewItem): string {
    return item.entity?.status ?? item.fact?.status ?? '';
  }

  private matchesReview(item: ReviewItem, query: ReviewQuery): boolean {
    const status = this.itemStatus(item);
    const statusMatch =
      query.status === 'all' || (query.status === 'open' ? status === 'failed' : status === query.status);
    return (
      statusMatch &&
      (query.itemKind === 'all' || item.itemKind === query.itemKind) &&
      (query.chapterIndex === null || item.chapterIndex === query.chapterIndex)
    );
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
