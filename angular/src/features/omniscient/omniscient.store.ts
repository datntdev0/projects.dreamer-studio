import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopApi } from '@core/desktop-api';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { I18nService } from '@core/i18n/i18n.service';
import { LlmStore } from '@core/stores/llm-store';
import { SettingsStore } from '@core/stores/settings-store';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { formatLlmChoice, LLM_CLIS, resolveLlm } from '@dreamer/shared/models/llm';
import type { LlmProblem } from '@dreamer/shared/models/llm';
import type {
  AnalysisPlan,
  AnalysisProgress,
  AnalysisRunOptions,
  AnalysisStatus,
} from '@dreamer/shared/models/analysis';
import type {
  EntityType,
  Occurrence,
  OntologyProblem,
  QuoteMatch,
  ReviewItem,
  ReviewPage,
} from '@dreamer/shared/models/analysis';
import type { ReviewStatusFilter, World, WorldEdit, WorldEntity, WorldLink } from '@dreamer/shared/models/analysis';
import { filterEntityTypes } from './omniscient-labels';
import type { EntityTypeFilter } from './omniscient-labels';

export type OmniscientView = 'graph' | 'table' | 'review';

export type OmniscientDialog =
  | { kind: 'run' }
  | { kind: 'ontology' }
  | { kind: 'fix'; item: ReviewItem }
  | { kind: 'entity'; mode: 'add' | 'rename' | 'type'; entityId: string | null }
  | { kind: 'merge'; entityIds: string[] }
  | { kind: 'split'; entityId: string }
  | { kind: 'fact'; entityId: string; factId: string | null };

export interface MergeBlock {
  key: string;
  count: number;
}

export interface OmniscientLlm {
  available: boolean;
  label: string;
  reason: string;
}

export interface AnalysisSummary {
  total: number;
  analysed: number;
  stale: number;
  failed: number;
}

const EMPTY_WORLD: World = { entities: [], links: [] };
const LLM_PROBLEM_KEYS: Record<LlmProblem, string> = {
  noDefault: 'settings.llm.features.problem.noDefault',
  defaultUnavailable: 'settings.llm.features.problem.defaultUnavailable',
  notInstalled: 'settings.llm.features.problem.notInstalled',
  invalidPath: 'settings.llm.features.problem.invalidPath',
};

@Injectable()
export class OmniscientStore {
  private readonly api = inject(DesktopApi);
  private readonly current = inject(CurrentNovelStore);
  private readonly i18n = inject(I18nService);
  private readonly llmStore = inject(LlmStore);
  private readonly settings = inject(SettingsStore);
  private readonly progressValue = signal<AnalysisProgress | null>(null);
  private statusRequest = 0;
  private worldRequest = 0;
  private reviewRequest = 0;

  readonly novelId = this.current.novelId;
  readonly novel = this.current.novel;
  readonly novels = this.current.novels;
  readonly status = signal<AnalysisStatus | null>(null);
  readonly world = signal<World | null>(null);
  readonly review = signal<ReviewPage | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly view = signal<OmniscientView>('graph');
  readonly dialog = signal<OmniscientDialog | null>(null);

  readonly asOfChapter = signal<number | null>(null);
  readonly onlyChapter = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly mergeIds = signal<string[]>([]);
  readonly query = signal('');
  readonly typeFilter = signal<EntityTypeFilter>('all');
  readonly predicateFilter = signal('all');
  readonly reviewStatus = signal<ReviewStatusFilter>('open');
  readonly reviewChapter = signal<number | null>(null);
  readonly reviewKind = signal<'entity' | 'fact' | 'all'>('all');

  readonly run = computed(() => this.progressValue() ?? this.status()?.run ?? null);
  readonly locked = computed(() => !!this.novel()?.lock || !!this.run());
  readonly ontology = computed(() => this.status()?.ontology ?? null);
  readonly ontologyProblems = computed<OntologyProblem[]>(() => this.status()?.ontologyProblems ?? []);
  readonly llm = computed<OmniscientLlm | null>(() => {
    const statuses = this.llmStore.statuses();
    const settings = this.settings.settings()?.llm;
    if (!statuses || !settings) return null;
    const { choice, problem } = resolveLlm(settings, 'worldAnalysis', statuses);
    const cli = choice ? LLM_CLIS[choice.cli].name : '';
    return {
      available: problem === null,
      label: choice ? formatLlmChoice(choice, this.i18n.t('settings.llm.features.cliDefault')) : '',
      reason: problem ? this.i18n.t(LLM_PROBLEM_KEYS[problem], { cli }) : '',
    };
  });
  readonly canRun = computed(
    () =>
      !!this.novelId() && !this.locked() && !this.busy() && !!this.llm()?.available && !this.ontologyProblems().length,
  );
  readonly summary = computed<AnalysisSummary>(() => {
    const chapters = this.status()?.chapters ?? [];
    const count = (...statuses: string[]): number => chapters.filter((item) => statuses.includes(item.status)).length;
    return {
      total: chapters.length,
      analysed: count('clean', 'has-issues', 'reviewed'),
      stale: count('stale'),
      failed: count('failed'),
    };
  });
  readonly analysedChapters = computed(() =>
    (this.status()?.chapters ?? []).filter((item) =>
      ['clean', 'has-issues', 'reviewed', 'stale'].includes(item.status),
    ),
  );
  readonly reviewChapters = computed(() =>
    (this.status()?.chapters ?? []).filter((item) => item.status === 'has-issues' || item.status === 'reviewed'),
  );
  readonly merge = computed(() => this.status()?.merge ?? null);
  readonly issueChapterCount = computed(
    () => this.reviewChapters().filter((item) => item.status === 'has-issues').length,
  );
  readonly mergeBlock = computed<MergeBlock | null>(() => {
    const merge = this.merge();
    if (this.run()) return { key: 'analysis.merge.blockedRunning', count: 0 };
    if (this.novel()?.lock) return { key: 'analysis.merge.blockedLocked', count: 0 };
    if (merge?.openIssues) return { key: 'analysis.merge.blockedIssues', count: merge.openIssues };
    return merge?.pending ? null : { key: 'analysis.merge.nothing', count: 0 };
  });
  readonly entities = computed(() => this.world()?.entities ?? []);
  readonly links = computed(() => this.world()?.links ?? []);
  readonly graphWorld = computed<World>(() => this.world() ?? EMPTY_WORLD);
  readonly graphTypes = computed<EntityType[]>(() => filterEntityTypes(this.typeFilter()));
  readonly graphPredicates = computed<string[]>(() => {
    const predicate = this.predicateFilter();
    return predicate === 'all' ? [] : [predicate];
  });
  readonly predicates = computed(() => [...new Set(this.links().map((item) => item.predicate))].sort());
  readonly visibleEntities = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const types = this.graphTypes();
    return this.entities().filter(
      (entity) =>
        (!types.length || types.includes(entity.type)) &&
        (!query || [entity.name, ...entity.aliases].some((name) => name.toLocaleLowerCase().includes(query))),
    );
  });
  readonly selected = computed<WorldEntity | null>(
    () => this.entities().find((item) => item.id === this.selectedId()) ?? null,
  );
  readonly openReviewCount = computed(() => this.merge()?.openIssues ?? 0);

  constructor() {
    void this.llmStore.load();
    const offProgress = this.api.onAnalysisProgress((progress) => {
      if (progress.novelId === this.novelId()) this.progressValue.set(progress);
    });
    const offChanged = this.api.onAnalysisChanged((event) => {
      if (event.novelId === this.novelId()) void this.reload();
    });
    inject(DestroyRef).onDestroy(() => {
      this.statusRequest++;
      this.worldRequest++;
      this.reviewRequest++;
      offProgress();
      offChanged();
    });
    effect(() => {
      const id = this.novelId();
      untracked(() => {
        this.progressValue.set(null);
        this.selectedId.set(null);
        this.mergeIds.set([]);
        this.asOfChapter.set(null);
        this.onlyChapter.set(false);
        this.reviewChapter.set(null);
        void this.reload(id);
      });
    });
  }

  async reload(id = this.novelId()): Promise<void> {
    const request = ++this.statusRequest;
    if (!id) {
      this.status.set(null);
      this.world.set(null);
      this.review.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const status = await this.api.analysisStatus(id);
      if (request !== this.statusRequest) return;
      this.status.set(status);
      this.progressValue.set(null);
      this.error.set('');
      await Promise.all([this.loadWorld(), this.loadReview()]);
    } catch (error) {
      if (request === this.statusRequest) this.error.set(errorMessage(error));
    } finally {
      if (request === this.statusRequest) this.loading.set(false);
    }
  }

  async loadWorld(): Promise<void> {
    const novelId = this.novelId();
    const request = ++this.worldRequest;
    if (!novelId) return;
    const world = await this.api.analysisWorld({ novelId, chapter: this.asOfChapter(), only: this.onlyChapter() });
    if (request !== this.worldRequest) return;
    this.world.set(world);
    if (this.selectedId() && !world?.entities.some((item) => item.id === this.selectedId())) this.selectedId.set(null);
    this.mergeIds.update((ids) => ids.filter((id) => world?.entities.some((entity) => entity.id === id)));
  }

  async loadReview(): Promise<void> {
    const novelId = this.novelId();
    const request = ++this.reviewRequest;
    if (!novelId) return;
    const review = await this.api.analysisReview({
      novelId,
      status: this.reviewStatus(),
      chapterIndex: this.reviewChapter(),
      itemKind: this.reviewKind(),
    });
    if (request === this.reviewRequest) this.review.set(review);
  }

  setTimeline(chapter: number | null, only = this.onlyChapter()): void {
    this.asOfChapter.set(chapter);
    this.onlyChapter.set(chapter !== null && only);
    void this.loadWorld();
  }

  setReviewFilter(filter: {
    status?: ReviewStatusFilter;
    chapter?: number | null;
    kind?: 'entity' | 'fact' | 'all';
  }): void {
    if (filter.status !== undefined) this.reviewStatus.set(filter.status);
    if (filter.chapter !== undefined) this.reviewChapter.set(filter.chapter);
    if (filter.kind !== undefined) this.reviewKind.set(filter.kind);
    void this.loadReview();
  }

  openReview(chapter: number | null = null): void {
    this.view.set('review');
    this.setReviewFilter({ chapter });
  }

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  toggleMerge(id: string): void {
    this.mergeIds.update((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  occurrences(entityId: string): Promise<Occurrence[]> {
    const novelId = this.novelId();
    return novelId ? this.api.analysisOccurrences({ novelId, entityId }) : Promise.resolve([]);
  }

  async plan(request: AnalysisRunOptions): Promise<AnalysisPlan | null> {
    const novelId = this.novelId();
    return novelId ? this.api.analysisPlan({ ...request, novelId }) : null;
  }

  start(request: AnalysisRunOptions): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.startAnalysis({ ...request, novelId });
      await this.reload();
    });
  }

  retryFailed(): Promise<boolean> {
    const failed = (this.review()?.failedChapters ?? []).map((item) => item.index);
    if (!failed.length) return Promise.resolve(false);
    return this.start({
      mode: 'range',
      from: Math.min(...failed),
      to: Math.max(...failed),
      overwrite: false,
      stage: 'all',
      batchSize: 1,
    });
  }

  mergeWorld(): Promise<boolean> {
    if (this.mergeBlock()) return Promise.resolve(false);
    return this.mutate(async (novelId) => {
      await this.api.analysisMerge(novelId);
      await this.reload();
    });
  }

  findQuote(quote: string): Promise<QuoteMatch[]> {
    const novelId = this.novelId();
    return novelId ? this.api.analysisFindQuote({ novelId, quote }) : Promise.resolve([]);
  }

  cancel(): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.cancelAnalysis(novelId);
      await this.reload();
    });
  }

  edit(edit: WorldEdit): Promise<boolean> {
    if (this.locked()) return Promise.resolve(false);
    return this.mutate(async (novelId) => {
      await this.api.analysisEdit({ novelId, edit });
      await this.reload();
    });
  }

  ontologyOpen(): Promise<boolean> {
    return this.mutate((novelId) => this.api.analysisOntologyOpen(novelId));
  }

  ontologyCheck(): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.analysisOntologyCheck(novelId);
      await this.reload();
    });
  }

  ontologyReset(): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.analysisOntologyReset(novelId);
      await this.reload();
    });
  }

  entityName(id: string): string {
    return this.entities().find((item) => item.id === id)?.name ?? id;
  }

  otherId(link: WorldLink, id: string): string {
    return link.source === id ? link.target : link.source;
  }

  linksOf(id: string): WorldLink[] {
    return this.links().filter((link) => link.source === id || link.target === id);
  }

  private async mutate(action: (novelId: string) => Promise<void>): Promise<boolean> {
    const novelId = this.novelId();
    if (!novelId || this.busy()) return false;
    this.busy.set(true);
    try {
      await action(novelId);
      this.error.set('');
      return true;
    } catch (error) {
      this.error.set(errorMessage(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
