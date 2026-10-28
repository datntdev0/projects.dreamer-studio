import { DestroyRef, inject, provideAppInitializer } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { DesktopApi } from '@core/desktop-api';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { findTextMatches } from '@dreamer/shared/core/text-match';
import type { LibraryChangedEvent, NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import type { ChapterTranslation } from '@dreamer/shared/models/translation';
import type { ChapterTranslationSummary } from '@dreamer/shared/models/translation';
import type { ContentRunPlan } from '@dreamer/shared/models/translation';
import type { ContentRunRequest } from '@dreamer/shared/models/translation';
import type { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import type { GlossaryBatchSize } from '@dreamer/shared/models/translation';
import type { GlossaryKey } from '@dreamer/shared/models/translation';
import type { GlossaryPage } from '@dreamer/shared/models/translation';
import type { GlossaryRow } from '@dreamer/shared/models/translation';
import type { GlossaryRunPlan } from '@dreamer/shared/models/translation';
import type { GlossaryRunRequest } from '@dreamer/shared/models/translation';
import type { InstructionRequest } from '@dreamer/shared/models/translation';
import type { InstructionSaveRequest } from '@dreamer/shared/models/translation';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import type { TranslationChanged } from '@dreamer/shared/models/translation';
import type { TranslationChapterRequest } from '@dreamer/shared/models/translation';
import type { TranslationInstruction } from '@dreamer/shared/models/translation';
import type { TranslationIssue } from '@dreamer/shared/models/translation';
import type { TranslationProgress } from '@dreamer/shared/models/translation';
import type { TranslationRun } from '@dreamer/shared/models/translation';
import type { TranslationSaveRequest } from '@dreamer/shared/models/translation';
import type { TranslationStatus } from '@dreamer/shared/models/translation';
import type { TranslationStatusQuery } from '@dreamer/shared/models/translation';
import { TARGET_LANGUAGES } from '@dreamer/shared/models/translation';
import { JADE_RIVER_NOVEL, UNANALYSED_CHAPTERS, UNANALYSED_NOVEL, jadeRiverChapters, jadeRiverNovel } from './analysis';
import { FakeAnalysisApi } from './analysis-api';
import { DEFAULT_INSTRUCTIONS, seedGlossaryRows, translatedName, translatedScene } from './translation';

export type TranslationScenario = 'normal' | 'none' | 'running' | 'notAnalysed' | 'noLlm' | 'locked';

const TICK_MS = 300;

function rowId(key: GlossaryKey): string {
  return `${key.entityType}:${key.entityName}:${key.alias ?? ''}`;
}

function glossaryBatches(rows: GlossaryRow[], size: GlossaryBatchSize): GlossaryRow[][] {
  const entities = new Map<string, GlossaryRow[]>();
  for (const row of rows) {
    const key = `${row.entityType}:${row.entityName}`;
    const group = entities.get(key) ?? [];
    group.push(row);
    entities.set(key, group);
  }
  const batches: GlossaryRow[][] = [];
  let batch: GlossaryRow[] = [];
  for (const group of entities.values()) {
    if (batch.length && batch.length + group.length > size) {
      batches.push(batch);
      batch = [];
    }
    batch.push(...group);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function isWord(text: string, start: number, end: number): boolean {
  if (/^\p{Script=Han}{2,}$/u.test(text.slice(start, end))) return true;
  return (
    (start === 0 || !/[\p{L}\p{N}]/u.test(text[start - 1])) && (end >= text.length || !/[\p{L}\p{N}]/u.test(text[end]))
  );
}

export class FakeTranslationApi extends FakeAnalysisApi {
  private readonly translationScenario: TranslationScenario;
  private readonly sourceNovel = jadeRiverNovel('zh');
  private readonly sourceChapters = jadeRiverChapters('zh');
  private readonly translations = new Map<string, ChapterTranslation>();
  private readonly rows = new Map<string, GlossaryRow>();
  private readonly instructions = new Map<TargetLanguage, TranslationInstruction>();
  private readonly translationProgressListeners = new Set<(progress: TranslationProgress) => void>();
  private readonly translationChangedListeners = new Set<(event: TranslationChanged) => void>();
  private readonly translationLibraryListeners = new Set<(event: LibraryChangedEvent) => void>();
  private translationRun: TranslationRun | null = null;
  private queue: number[] = [];
  private glossaryQueue: string[][] = [];
  private translationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(scenario: TranslationScenario, destroyRef: DestroyRef) {
    super(
      scenario === 'locked'
        ? 'locked'
        : scenario === 'noLlm'
          ? 'noLlm'
          : scenario === 'notAnalysed'
            ? 'notAnalysed'
            : 'normal',
      destroyRef,
      'zh',
    );
    this.translationScenario = scenario;
    for (const language of this.targetLanguages(JADE_RIVER_NOVEL.id))
      for (const row of seedGlossaryRows(language)) this.rows.set(this.glossaryKey(language, row), row);
    if (scenario !== 'none' && scenario !== 'notAnalysed') {
      for (let index = 1; index <= 20; index++) {
        const source = this.sourceChapters[index - 1];
        const scene = translatedScene(index, 'vi');
        if (index === 2) scene.paragraphs[1] = scene.paragraphs[1].replace('Kiều sư phụ', 'Vị sư phụ');
        if (index === 3) scene.paragraphs[1] = scene.paragraphs[1].replace('Hà Quỷ', 'River Ghost');
        if (index === 4) scene.paragraphs.pop();
        const detail: ChapterTranslation = {
          index,
          file: source.file,
          language: 'vi',
          title: scene.title,
          paragraphs: scene.paragraphs,
          status: index === 19 || index === 20 ? 'stale' : 'translated',
          issues: 0,
          edited: index === 5,
          staleReason: index === 19 ? 'source' : index === 20 ? 'glossary' : null,
          instructionChanged: index === 7,
          error: null,
          issueList: [],
          translatedAt: '2026-10-24T10:00:00.000Z',
        };
        this.translations.set(this.translationKey('vi', source.file), detail);
      }
      for (let index = 1; index <= 10; index++) {
        const source = this.sourceChapters[index - 1];
        const scene = translatedScene(index, 'en');
        if (index === 3) scene.paragraphs[1] = scene.paragraphs[1].replace('River Ghost', 'masked figure');
        const detail: ChapterTranslation = {
          index,
          file: source.file,
          language: 'en',
          title: scene.title,
          paragraphs: scene.paragraphs,
          status: 'translated',
          issues: 0,
          edited: index === 5,
          staleReason: null,
          instructionChanged: false,
          error: null,
          issueList: [],
          translatedAt: '2026-10-24T10:00:00.000Z',
        };
        this.translations.set(this.translationKey('en', source.file), detail);
      }
      for (const detail of this.translations.values()) this.check(detail);
    }
    if (scenario === 'running')
      this.begin(
        'content',
        'vi',
        Array.from({ length: 19 }, (_, index) => index + 22),
      );
    destroyRef.onDestroy(() => this.stop(false));
  }

  override async listNovels(): Promise<NovelSummary[]> {
    const novels = await super.listNovels();
    return novels.map((novel) => ({
      ...novel,
      translations:
        novel.id === JADE_RIVER_NOVEL.id ? this.languageSummaries(novel.id, novel.chapterCount) : novel.translations,
      lock:
        novel.id === JADE_RIVER_NOVEL.id && this.translationRun
          ? {
              runId: 'story-translation',
              type:
                this.translationRun.kind === 'content'
                  ? ('content-translation' as const)
                  : ('glossary-translation' as const),
              label: novel.title,
              status: 'running' as const,
            }
          : novel.lock,
    }));
  }

  override async getNovel(id: string): Promise<NovelDetail | null> {
    return super.getNovel(id);
  }

  override onLibraryChanged(listener: (event: LibraryChangedEvent) => void): () => void {
    const offBase = super.onLibraryChanged(listener);
    this.translationLibraryListeners.add(listener);
    return () => {
      offBase();
      this.translationLibraryListeners.delete(listener);
    };
  }

  override async translationStatus(query: TranslationStatusQuery): Promise<TranslationStatus> {
    const novelId = query.novelId;
    const source = novelId === JADE_RIVER_NOVEL.id ? this.sourceChapters : UNANALYSED_CHAPTERS;
    const language: TargetLanguage = query.language ?? this.targetLanguages(novelId)[0];
    const chapters = source.map((chapter): ChapterTranslationSummary => {
      const stored =
        novelId === JADE_RIVER_NOVEL.id
          ? this.translations.get(this.translationKey(language, chapter.file))
          : undefined;
      if (stored) return this.summary(stored);
      return {
        index: chapter.index,
        file: chapter.file,
        status:
          chapter.index === (language === 'vi' ? 21 : 11) &&
          novelId === JADE_RIVER_NOVEL.id &&
          this.translationScenario !== 'none'
            ? 'failed'
            : 'not-translated',
        issues: 0,
        edited: false,
        staleReason: null,
        instructionChanged: false,
        error:
          chapter.index === (language === 'vi' ? 21 : 11) &&
          novelId === JADE_RIVER_NOVEL.id &&
          this.translationScenario !== 'none'
            ? 'The model returned an incomplete translation.'
            : null,
      };
    });
    const rows = await this.worldRows(novelId, language);
    const available = this.translationScenario !== 'noLlm';
    const llm = { available, label: available ? 'Storybook LLM' : '', reason: available ? null : 'No LLM configured' };
    return {
      novelId,
      language,
      targets: this.targetLanguages(novelId),
      languages: this.languageSummaries(novelId, source.length),
      chapters,
      glossary: { total: rows.length, untranslated: rows.filter((row) => row.status === 'untranslated').length },
      run: novelId === JADE_RIVER_NOVEL.id ? this.translationRun && { ...this.translationRun } : null,
      llm: { glossary: llm, content: llm },
    };
  }

  override async translationChapter(request: TranslationChapterRequest): Promise<ChapterTranslation | null> {
    const chapter =
      request.novelId === JADE_RIVER_NOVEL.id
        ? this.translations.get(this.translationKey(request.language, request.file))
        : undefined;
    if (chapter) return { ...chapter, paragraphs: [...chapter.paragraphs], issueList: [...chapter.issueList] };
    const source = (request.novelId === JADE_RIVER_NOVEL.id ? this.sourceChapters : UNANALYSED_CHAPTERS).find(
      (item) => item.file === request.file,
    );
    if (!source) return null;
    const summary = (
      await this.translationStatus({ novelId: request.novelId, language: request.language })
    ).chapters.find((item) => item.file === request.file)!;
    return { ...summary, language: request.language, title: '', paragraphs: [], issueList: [], translatedAt: null };
  }

  override async translationGlossary(query: InstructionRequest): Promise<GlossaryPage> {
    const rows = await this.worldRows(query.novelId, query.language);
    const world = await this.analysisWorld({ novelId: query.novelId, chapter: null, only: false });
    return {
      novelId: query.novelId,
      language: query.language,
      analysed: !!world?.entities.length,
      rows,
    };
  }

  override async translationEditGlossary(request: GlossaryEditRequest): Promise<void> {
    this.assertAvailable(request.novelId, false);
    const key = this.glossaryKey(request.language, request.key);
    const row = this.rows.get(key);
    if (!row) return;
    const translation = request.translation?.trim() || null;
    this.rows.set(key, { ...row, translation, status: translation ? 'user' : 'untranslated' });
    const name = request.key.alias ?? request.key.entityName;
    for (const detail of this.translations.values()) {
      if (detail.language !== request.language) continue;
      const source = this.sourceChapters[detail.index - 1];
      if (!source?.paragraphs.some((paragraph) => findTextMatches(paragraph, name).length)) continue;
      detail.status = 'stale';
      detail.staleReason = 'glossary';
      this.check(detail);
    }
    this.emitTranslationChanged(request.novelId, request.language);
  }

  override async translationInstruction(request: InstructionRequest): Promise<TranslationInstruction> {
    return (
      this.instructions.get(request.language) ?? {
        novelId: request.novelId,
        language: request.language,
        text: DEFAULT_INSTRUCTIONS[request.language],
        isDefault: true,
        updatedAt: null,
      }
    );
  }

  override async translationSaveInstruction(request: InstructionSaveRequest): Promise<TranslationInstruction> {
    this.assertAvailable(request.novelId, false);
    const result = { ...request, isDefault: false, updatedAt: new Date().toISOString() };
    this.instructions.set(request.language, result);
    for (const detail of this.translations.values()) {
      if (detail.language === request.language) detail.instructionChanged = true;
    }
    this.emitTranslationChanged(request.novelId, request.language);
    return result;
  }

  override async translationResetInstruction(request: InstructionRequest): Promise<TranslationInstruction> {
    this.assertAvailable(request.novelId, false);
    this.instructions.delete(request.language);
    for (const detail of this.translations.values()) {
      if (detail.language === request.language) detail.instructionChanged = true;
    }
    const result = await this.translationInstruction(request);
    this.emitTranslationChanged(request.novelId, request.language);
    return result;
  }

  override async translationPlanContent(request: ContentRunRequest): Promise<ContentRunPlan> {
    const status = await this.translationStatus(request);
    const queue = status.chapters.filter(
      (chapter) => this.inContentRange(chapter, request) && this.contentEligible(chapter, request),
    );
    const rows = await this.worldRows(request.novelId, request.language);
    const source = request.novelId === JADE_RIVER_NOVEL.id ? this.sourceChapters : UNANALYSED_CHAPTERS;
    const plannedText = source
      .filter((chapter) => queue.some((item) => item.index === chapter.index))
      .flatMap((chapter) => [chapter.title, ...chapter.paragraphs]);
    return {
      count: queue.length,
      from: queue[0]?.index ?? null,
      to: queue.at(-1)?.index ?? null,
      userEdited: queue.filter((chapter) => chapter.edited).length,
      untranslatedNames: rows.filter((row) => {
        if (row.status !== 'untranslated') return false;
        const name = row.alias ?? row.entityName;
        return plannedText.some((text) =>
          findTextMatches(text, name).some((match) => isWord(text, match.start, match.end)),
        );
      }).length,
      blockedReason:
        this.blockedReason(request.novelId, 'content') ?? (queue.length ? null : 'TRANSLATION_NOTHING_TO_RUN'),
    };
  }

  override async translationStartContent(request: ContentRunRequest): Promise<void> {
    const plan = await this.translationPlanContent(request);
    if (plan.blockedReason) throw new Error(plan.blockedReason);
    const status = await this.translationStatus(request);
    const queue = status.chapters
      .filter((chapter) => this.inContentRange(chapter, request) && this.contentEligible(chapter, request))
      .map((chapter) => chapter.index);
    this.begin('content', request.language, queue);
  }

  override async translationPlanGlossary(request: GlossaryRunRequest): Promise<GlossaryRunPlan> {
    const rows = await this.worldRows(request.novelId, request.language);
    const eligible = rows.filter(
      (row) => row.status !== 'user' && (request.scope === 'all' || row.status === 'untranslated'),
    );
    const count = eligible.length;
    return {
      count,
      batches: glossaryBatches(eligible, request.batchSize).length,
      blockedReason: this.blockedReason(request.novelId, 'glossary') ?? (count ? null : 'TRANSLATION_NOTHING_TO_RUN'),
    };
  }

  override async translationStartGlossary(request: GlossaryRunRequest): Promise<void> {
    const plan = await this.translationPlanGlossary(request);
    if (plan.blockedReason) throw new Error(plan.blockedReason);
    const rows = (await this.worldRows(request.novelId, request.language)).filter(
      (row) => row.status !== 'user' && (request.scope === 'all' || row.status === 'untranslated'),
    );
    this.glossaryQueue = glossaryBatches(rows, request.batchSize).map((batch) => batch.map(rowId));
    this.begin(
      'glossary',
      request.language,
      this.glossaryQueue.map((_, index) => index),
    );
  }

  override async translationCancel(novelId: string): Promise<void> {
    if (novelId === JADE_RIVER_NOVEL.id) this.stop(true);
  }

  override async translationSave(request: TranslationSaveRequest): Promise<ChapterTranslation> {
    this.assertAvailable(request.novelId, false);
    const source = this.sourceChapters.find((chapter) => chapter.file === request.file);
    if (!source) throw new Error('Chapter not found');
    const previous = this.translations.get(this.translationKey(request.language, request.file));
    const detail: ChapterTranslation = {
      index: source.index,
      file: source.file,
      language: request.language,
      title: request.title,
      paragraphs: [...request.paragraphs],
      status: 'translated',
      issues: 0,
      edited: true,
      staleReason: null,
      instructionChanged: previous?.instructionChanged ?? false,
      error: null,
      issueList: [],
      translatedAt: new Date().toISOString(),
    };
    this.check(detail);
    this.translations.set(this.translationKey(request.language, request.file), detail);
    this.emitTranslationChanged(request.novelId, request.language);
    this.emitLibrary();
    return { ...detail, paragraphs: [...detail.paragraphs], issueList: [...detail.issueList] };
  }

  override onTranslationProgress(listener: (progress: TranslationProgress) => void): () => void {
    this.translationProgressListeners.add(listener);
    return () => this.translationProgressListeners.delete(listener);
  }

  override onTranslationChanged(listener: (event: TranslationChanged) => void): () => void {
    this.translationChangedListeners.add(listener);
    return () => this.translationChangedListeners.delete(listener);
  }

  private translationKey(language: TargetLanguage, file: string): string {
    return `${language}:${file}`;
  }

  private glossaryKey(language: TargetLanguage, key: GlossaryKey): string {
    return `${language}:${rowId(key)}`;
  }

  private targetLanguages(novelId: string): TargetLanguage[] {
    const sourceLanguage = novelId === JADE_RIVER_NOVEL.id ? this.sourceNovel.language : UNANALYSED_NOVEL.language;
    return TARGET_LANGUAGES.filter((language) => language !== sourceLanguage);
  }

  private languageSummaries(
    novelId: string,
    total: number,
  ): { language: TargetLanguage; translated: number; total: number }[] {
    return this.targetLanguages(novelId).map((language) => ({
      language,
      translated:
        novelId === JADE_RIVER_NOVEL.id
          ? [...this.translations.values()].filter(
              (detail) =>
                detail.language === language && !['stale', 'failed', 'not-translated'].includes(detail.status),
            ).length
          : 0,
      total,
    }));
  }

  private summary(detail: ChapterTranslation): ChapterTranslationSummary {
    const { index, file, status, issues, edited, staleReason, instructionChanged, error } = detail;
    return { index, file, status, issues, edited, staleReason, instructionChanged, error };
  }

  private async worldRows(novelId: string, language: TargetLanguage): Promise<GlossaryRow[]> {
    const world = await this.analysisWorld({ novelId, chapter: null, only: false });
    const keys = new Set((world?.entities ?? []).map((entity) => `${entity.type}:${entity.name}`));
    return seedGlossaryRows(language)
      .filter((row) => keys.has(`${row.entityType}:${row.entityName}`))
      .map((row) => this.rows.get(this.glossaryKey(language, row)) ?? row);
  }

  private check(detail: ChapterTranslation): void {
    const source = this.sourceChapters[detail.index - 1];
    const issues: TranslationIssue[] = [];
    if (!source) return;
    if (source.paragraphs.length !== detail.paragraphs.length)
      issues.push({
        id: `c${detail.index}-paragraph-count`,
        kind: 'paragraph-count',
        name: null,
        translation: null,
        inTitle: false,
        sourceParagraph: null,
        translatedParagraph: null,
        sourceCount: source.paragraphs.length,
        translatedCount: detail.paragraphs.length,
      });
    const rows = [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${detail.language}:`))
      .map(([, row]) => row)
      .sort((a, b) => (b.alias ?? b.entityName).length - (a.alias ?? a.entityName).length);
    source.paragraphs.forEach((paragraph, index) => {
      const consumed: { start: number; end: number }[] = [];
      for (const row of rows) {
        const name = row.alias ?? row.entityName;
        const match = findTextMatches(paragraph, name).find(
          (item) =>
            isWord(paragraph, item.start, item.end) &&
            !consumed.some((used) => item.start < used.end && item.end > used.start),
        );
        if (!match) continue;
        consumed.push(match);
        const target = detail.paragraphs[index] ?? '';
        if (row.translation && findTextMatches(target, row.translation).length) continue;
        const originalLeft = findTextMatches(target, name).length > 0;
        issues.push({
          id: `c${detail.index}-p${index}-${rowId(row)}`,
          kind: !row.translation || originalLeft ? 'untranslated-name' : 'missing-name',
          name,
          translation: row.translation,
          inTitle: false,
          sourceParagraph: index,
          translatedParagraph: index < detail.paragraphs.length ? index : null,
          sourceCount: null,
          translatedCount: null,
        });
      }
    });
    detail.issueList = issues;
    detail.issues = issues.length;
    if (detail.status !== 'stale') detail.status = issues.length ? 'has-issues' : 'translated';
  }

  private inContentRange(chapter: ChapterTranslationSummary, request: ContentRunRequest): boolean {
    return (
      request.mode !== 'range' ||
      (chapter.index >= (request.from ?? 1) && chapter.index <= (request.to ?? Number.MAX_SAFE_INTEGER))
    );
  }

  private contentEligible(chapter: ChapterTranslationSummary, request: ContentRunRequest): boolean {
    const missing = ['not-translated', 'stale', 'failed'].includes(chapter.status);
    return request.mode === 'missing' ? missing : request.overwrite || missing;
  }

  private blockedReason(novelId: string, kind: 'content' | 'glossary'): string | null {
    if (this.translationScenario === 'locked' || this.translationRun) return 'NOVEL_LOCKED';
    if (this.translationScenario === 'noLlm') return 'LLM_UNAVAILABLE';
    if (kind === 'glossary' && novelId === UNANALYSED_NOVEL.id) return 'ANALYSIS_REQUIRED';
    return null;
  }

  private assertAvailable(novelId: string, llm: boolean): void {
    const reason = llm
      ? this.blockedReason(novelId, 'content')
      : this.translationScenario === 'locked' || this.translationRun
        ? 'NOVEL_LOCKED'
        : null;
    if (reason) throw new Error(reason);
  }

  private begin(kind: 'content' | 'glossary', language: TargetLanguage, queue: number[]): void {
    if (!queue.length) return;
    this.queue = queue;
    this.translationRun = {
      kind,
      language,
      runningChapter: kind === 'content' ? queue[0] : null,
      done: 0,
      total: queue.length,
      failed: 0,
    };
    this.emitTranslationProgress();
    this.emitLibrary();
    this.translationTimer = setInterval(() => this.advance(), TICK_MS);
  }

  private advance(): void {
    const run = this.translationRun;
    if (!run) return;
    const item = this.queue[run.done];
    if (run.kind === 'content') {
      const source = this.sourceChapters[item - 1];
      if (source) {
        const scene = translatedScene(item, run.language);
        const detail: ChapterTranslation = {
          index: item,
          file: source.file,
          language: run.language,
          title: scene.title,
          paragraphs: scene.paragraphs,
          status: 'translated',
          issues: 0,
          edited: false,
          staleReason: null,
          instructionChanged: false,
          error: null,
          issueList: [],
          translatedAt: new Date().toISOString(),
        };
        this.check(detail);
        this.translations.set(this.translationKey(run.language, source.file), detail);
      }
    } else {
      for (const id of this.glossaryQueue[item] ?? []) {
        const key = `${run.language}:${id}`;
        const row = this.rows.get(key);
        if (row)
          this.rows.set(key, {
            ...row,
            translation: translatedName(row.alias ?? row.entityName, run.language),
            status: 'llm',
          });
      }
    }
    run.done++;
    run.runningChapter = run.kind === 'content' ? (this.queue[run.done] ?? null) : null;
    this.emitTranslationChanged(JADE_RIVER_NOVEL.id, run.language);
    if (run.done >= run.total) this.stop(true);
    else this.emitTranslationProgress();
  }

  private stop(emit: boolean): void {
    if (this.translationTimer) clearInterval(this.translationTimer);
    this.translationTimer = null;
    const language = this.translationRun?.language ?? 'vi';
    this.translationRun = null;
    this.queue = [];
    this.glossaryQueue = [];
    if (emit) {
      this.emitTranslationProgress();
      this.emitTranslationChanged(JADE_RIVER_NOVEL.id, language);
      this.emitLibrary();
    }
  }

  private emitTranslationProgress(): void {
    this.translationProgressListeners.forEach((listener) =>
      listener({ novelId: JADE_RIVER_NOVEL.id, run: this.translationRun && { ...this.translationRun } }),
    );
  }

  private emitTranslationChanged(novelId: string, language: TargetLanguage): void {
    this.translationChangedListeners.forEach((listener) => listener({ novelId, language }));
  }

  private emitLibrary(): void {
    this.translationLibraryListeners.forEach((listener) => listener({ novelIds: [JADE_RIVER_NOVEL.id] }));
  }
}

export function provideFakeTranslationApi(scenario: TranslationScenario): (Provider | EnvironmentProviders)[] {
  return [
    { provide: DesktopApi, useFactory: () => new FakeTranslationApi(scenario, inject(DestroyRef)) },
    provideAppInitializer(() =>
      inject(CurrentNovelStore).select(scenario === 'notAnalysed' ? UNANALYSED_NOVEL.id : JADE_RIVER_NOVEL.id),
    ),
  ];
}
