import { DestroyRef, inject, provideAppInitializer, type EnvironmentProviders, type Provider } from '@angular/core';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { checkWorld } from '@dreamer/shared/core/analysis-checks';
import {
  applyReviewEdit,
  chapterReviewStatus,
  filterReviewItems,
  issueCounts,
} from '@dreamer/shared/core/analysis-review';
import { reviewEntityOptions, reviewItems } from '@dreamer/shared/core/analysis-review';
import {
  activeOverlay,
  buildWorld,
  entityOccurrences,
  findQuoteMatches,
  isReviewEdit,
  overlayOrphans,
} from '@dreamer/shared/core/world';
import { checkOverlayEdit } from '@dreamer/shared/core/world-overlay-checks';
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
  ENTITY_SEEDS,
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

function readyToMergeEdits(edition: JadeRiverEdition): ReviewEdit[] {
  const qiao = ENTITY_SEEDS.find((seed) => seed.id === 'master-qiao')!;
  return [
    { kind: 'review-reject', chapterIndex: 26, itemKind: 'fact', itemId: 'c26-missing-quote' },
    { kind: 'review-reject', chapterIndex: 27, itemKind: 'entity', itemId: 'invalid-crown' },
    { kind: 'review-reject', chapterIndex: 4, itemKind: 'entity', itemId: 'jade-river-term' },
    {
      kind: 'review-fix',
      chapterIndex: 26,
      itemKind: 'entity',
      itemId: 'ash-court-place',
      entity: { type: 'Organization' },
    },
    {
      kind: 'review-fix',
      chapterIndex: 28,
      itemKind: 'entity',
      itemId: 'master-qiao',
      entity: { aliases: edition === 'zh' ? qiao.zhAliases : qiao.aliases },
    },
  ];
}

function withWorldConflicts(details: Map<number, AnalysisChapterDetail>): void {
  const current = [...details.values()].filter((detail) => DONE.includes(detail.status));
  for (const detail of checkWorld(current, DEFAULT_ONTOLOGY)) details.set(detail.index, detail);
}

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
      ...(scenario === 'readyToMerge' ? readyToMergeEdits(edition) : []),
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
    const details = this.details(novelId);
    const chapters = (this.chapters.get(novelId) ?? []).map((chapter): ChapterAnalysisSummary => {
      const detail = details.get(chapter.index)!;
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
      const status = this.chapterStatus(chapter, detail);
      return { index, title, file, resultFile, status, counts, pending: pending.has(index), error };
    });
    const issues = issueCounts(reviewItems(this.reviewChapters(chapters, details)));
    return {
      novelId,
      chapters,
      run: this.activeRuns.get(novelId) ?? null,
      merge: {
        pending: pending.size,
        openIssues: issues.open,
        openErrors: issues.errors,
        mergedAt: this.mergedAt.get(novelId) ?? null,
      },
      ontology: DEFAULT_ONTOLOGY,
      ontologyProblems: this.invalidOntology ? ONTOLOGY_PROBLEMS : [],
      lastRun: null,
    };
  }

  override async analysisChapter(request: AnalysisChapterRequest): Promise<AnalysisChapterDetail | null> {
    const chapter = this.chapters.get(request.novelId)?.find((item) => item.file === request.file);
    return chapter ? (this.details(request.novelId).get(chapter.index) ?? null) : null;
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
    const merged = this.merged.get(query.novelId) ?? [];
    const overlay = this.overlay.get(query.novelId) ?? [];
    return {
      ...buildWorld(merged, { chapter: query.chapter, only: query.only }, overlay),
      orphans: overlayOrphans(merged, overlay),
      mergedAt: this.mergedAt.get(query.novelId) ?? null,
    };
  }

  override async analysisReview(query: ReviewQuery): Promise<ReviewPage | null> {
    const status = await this.analysisStatus(query.novelId);
    const chapters = this.reviewChapters(status?.chapters ?? [], this.details(query.novelId));
    return {
      items: filterReviewItems(reviewItems(chapters), query),
      openCount: status?.merge.openIssues ?? 0,
      entities: reviewEntityOptions(chapters),
    };
  }

  override async analysisOccurrences(query: OccurrenceQuery): Promise<Occurrence[]> {
    const world = await this.analysisWorld({ novelId: query.novelId, chapter: null, only: false });
    const entity = world?.entities.find((item) => item.id === query.entityId);
    if (!entity) return [];
    const chapters = this.chapters.get(query.novelId) ?? [];
    return entityOccurrences(entity, chapters);
  }

  override async analysisEdit(request: AnalysisEditRequest): Promise<void> {
    const { novelId, edit } = request;
    this.assertFree(novelId);
    if (isReviewEdit(edit)) {
      const edits = this.reviewEdits.get(novelId) ?? [];
      this.reviewEdits.set(novelId, [...edits, edit]);
      try {
        this.details(novelId);
      } catch (error) {
        this.reviewEdits.set(novelId, edits);
        throw error;
      }
    } else await this.saveOverlayEdit(novelId, edit);
    this.emitChanged(novelId);
  }

  private async saveOverlayEdit(novelId: string, edit: OverlayEdit): Promise<void> {
    const world = await this.analysisWorld({ novelId, chapter: null, only: false });
    const code = checkOverlayEdit({
      edit,
      world: world ?? { entities: [], links: [] },
      ontology: DEFAULT_ONTOLOGY,
      chapters: this.chapters.get(novelId) ?? [],
    });
    if (code) throw new CodedError(code, `Edit ${edit.kind} is not valid`);
    this.overlay.set(novelId, activeOverlay([...(this.overlay.get(novelId) ?? []), edit]));
  }

  override async analysisMerge(novelId: string): Promise<void> {
    this.assertFree(novelId);
    const openErrors = (await this.analysisStatus(novelId))?.merge.openErrors ?? 0;
    if (openErrors) throw new CodedError(ErrorCode.AnalysisOpenIssues, `${openErrors} errors are still open`);
    this.pending.set(novelId, new Set());
    this.merged.set(novelId, this.snapshot(novelId));
    this.mergedAt.set(novelId, new Date().toISOString());
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

  private details(novelId: string): Map<number, AnalysisChapterDetail> {
    const details = new Map<number, AnalysisChapterDetail>(
      (this.chapters.get(novelId) ?? []).map((chapter) => [chapter.index, { ...chapter }]),
    );
    withWorldConflicts(details);
    for (const edit of this.reviewEdits.get(novelId) ?? []) {
      const detail = details.get(edit.chapterIndex);
      if (!detail) continue;
      const edited = applyReviewEdit({
        chapter: detail,
        entities: detail.entities,
        facts: detail.facts,
        edit,
        ontology: DEFAULT_ONTOLOGY,
      });
      details.set(edit.chapterIndex, { ...detail, ...edited });
      withWorldConflicts(details);
    }
    return details;
  }

  private snapshot(novelId: string): AnalysisChapterDetail[] {
    const pending = this.pending.get(novelId) ?? new Set<number>();
    return [...this.details(novelId).values()].filter(
      (chapter) => chapter.resultFile && chapter.status !== 'failed' && !pending.has(chapter.index),
    );
  }

  private chapterStatus(chapter: ChapterAnalysis, detail: AnalysisChapterDetail): ChapterAnalysisStatus {
    if (!DONE.includes(chapter.status)) return chapter.status;
    return chapterReviewStatus(detail.entities, detail.facts);
  }

  private reviewChapters(
    chapters: ChapterAnalysisSummary[],
    details: Map<number, AnalysisChapterDetail>,
  ): AnalysisChapterDetail[] {
    return chapters.filter((chapter) => DONE.includes(chapter.status)).map((chapter) => details.get(chapter.index)!);
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
