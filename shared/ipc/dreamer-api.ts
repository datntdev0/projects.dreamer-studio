import { AppError } from '../errors/app-error';
import { AppInfo } from './app';
import { BackendStatus } from './backend';
import { DevCrashKind } from './dev';
import { LogEntry } from './log';
import { AboutLink } from '../models/about';
import { DiagnosticsRun } from '../models/diagnostics';
import { LlmCliId, LlmCliStatus, LlmPathRequest, LlmTestResult } from '../models/llm';
import { PipelineListQuery, PipelineLogChunk, PipelinePage } from '../models/pipeline';
import { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '../models/pipeline';
import { NovelImportRequest, PackageReadResult, PickedImage } from '../models/novel-package';
import { ChapterChangeRequest, ChapterRequest, ChapterText } from '../models/novel';
import { SearchProgress, SearchRequest } from '../models/novel';
import { DeleteNovelsResult, LibraryChangedEvent, NovelDetail, NovelPatch, NovelSummary } from '../models/novel';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '../models/app-data';
import { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '../models/settings';
import {
  AnalysisChanged,
  AnalysisChapterDetail,
  AnalysisChapterRequest,
  AnalysisEditRequest,
} from '../models/analysis';
import type { ChapterTranslation } from '../models/translation';
import type { ContentRunPlan } from '../models/translation';
import type { ContentRunRequest } from '../models/translation';
import type { GlossaryEditRequest } from '../models/translation';
import type { GlossaryPage } from '../models/translation';
import type { GlossaryRunPlan } from '../models/translation';
import type { GlossaryRunRequest } from '../models/translation';
import type { InstructionRequest } from '../models/translation';
import type { InstructionSaveRequest } from '../models/translation';
import type { TranslationChanged } from '../models/translation';
import type { TranslationChapterRequest } from '../models/translation';
import type { TranslationInstruction } from '../models/translation';
import type { TranslationProgress } from '../models/translation';
import type { TranslationSaveRequest } from '../models/translation';
import type { TranslationStatus } from '../models/translation';
import type { TranslationStatusQuery } from '../models/translation';
import { AnalysisPlan, AnalysisProgress, AnalysisRunRequest, AnalysisStatus } from '../models/analysis';
import {
  Occurrence,
  OccurrenceQuery,
  OntologyProblem,
  QuoteMatch,
  QuoteQuery,
  ReviewPage,
  ReviewQuery,
  World,
  WorldEditPreview,
  WorldEditScope,
  WorldPreviewRequest,
  WorldQuery,
  WorldScopeRequest,
} from '../models/analysis';

export interface DreamerApi {
  app: {
    info(): Promise<AppInfo>;
    openLogs(): Promise<void>;
    openDataDir(): Promise<void>;
    openLink(link: AboutLink): Promise<void>;
    onError(listener: (error: AppError) => void): () => void;
  };
  log: {
    write(entry: LogEntry): void;
  };
  backend: {
    status(): Promise<BackendStatus>;
    onStatus(listener: (status: BackendStatus) => void): () => void;
  };
  settings: {
    get(): Promise<SettingsState>;
    update(patch: SettingsPatch): Promise<AppSettings>;
    reset(section: SettingsSection): Promise<AppSettings>;
    onChanged(listener: (settings: AppSettings) => void): () => void;
  };
  llm: {
    status(): Promise<LlmCliStatus[]>;
    detect(): Promise<LlmCliStatus[]>;
    test(cli: LlmCliId): Promise<LlmTestResult>;
    pickPath(cli: LlmCliId): Promise<string | null>;
    setPath(request: LlmPathRequest): Promise<LlmCliStatus>;
    onChanged(listener: (statuses: LlmCliStatus[]) => void): () => void;
  };
  appData: {
    pickFolder(): Promise<string | null>;
    inspect(path: string): Promise<AppDataCandidate>;
    switch(path: string): Promise<AppInfo>;
    status(): Promise<AppDataStatus>;
    onProgress(listener: (step: AppDataStep) => void): () => void;
    onChanged(listener: (info: AppInfo) => void): () => void;
  };
  diagnostics: {
    run(): Promise<DiagnosticsRun>;
  };
  pipeline: {
    types(): Promise<PipelineTypeInfo[]>;
    start(request: PipelineStartRequest): Promise<PipelineRun>;
    cancel(id: string): Promise<void>;
    list(query: PipelineListQuery): Promise<PipelinePage>;
    get(id: string): Promise<PipelineRun>;
    log(id: string): Promise<string[]>;
    delete(ids: string[]): Promise<string[]>;
    onUpdate(listener: (run: PipelineRun) => void): () => void;
    onDeleted(listener: (ids: string[]) => void): () => void;
    onLog(listener: (chunk: PipelineLogChunk) => void): () => void;
  };
  library: {
    pickPackage(): Promise<string | null>;
    readPackage(path: string): Promise<PackageReadResult>;
    pickImage(): Promise<PickedImage | null>;
    import(request: NovelImportRequest): Promise<PipelineRun>;
    export(id: string): Promise<PipelineRun | null>;
    showExport(runId: string): Promise<void>;
    pathForFile(file: File): string;
    list(): Promise<NovelSummary[]>;
    get(id: string): Promise<NovelDetail>;
    getChapter(request: ChapterRequest): Promise<ChapterText>;
    search(request: SearchRequest): Promise<void>;
    cancelSearch(searchId: string): Promise<void>;
    onSearchProgress(listener: (progress: SearchProgress) => void): () => void;
    updateNovel(id: string, patch: NovelPatch): Promise<NovelDetail>;
    changeChapters(request: ChapterChangeRequest): Promise<NovelDetail>;
    deleteNovels(ids: string[]): Promise<DeleteNovelsResult>;
    openFolder(id: string): Promise<void>;
    onChanged(listener: (event: LibraryChangedEvent) => void): () => void;
  };
  analysis: {
    status(novelId: string): Promise<AnalysisStatus>;
    chapter(request: AnalysisChapterRequest): Promise<AnalysisChapterDetail>;
    plan(request: AnalysisRunRequest): Promise<AnalysisPlan>;
    start(request: AnalysisRunRequest): Promise<void>;
    cancel(novelId: string): Promise<void>;
    world(query: WorldQuery): Promise<World>;
    review(query: ReviewQuery): Promise<ReviewPage>;
    occurrences(query: OccurrenceQuery): Promise<Occurrence[]>;
    edit(request: AnalysisEditRequest): Promise<void>;
    scope(request: WorldScopeRequest): Promise<WorldEditScope>;
    preview(request: WorldPreviewRequest): Promise<WorldEditPreview>;
    findQuote(query: QuoteQuery): Promise<QuoteMatch[]>;
    ontologyOpen(novelId: string): Promise<void>;
    ontologyReset(novelId: string): Promise<OntologyProblem[]>;
    ontologyCheck(novelId: string): Promise<OntologyProblem[]>;
    onProgress(listener: (progress: AnalysisProgress) => void): () => void;
    onChanged(listener: (event: AnalysisChanged) => void): () => void;
  };
  translation?: {
    status(query: TranslationStatusQuery): Promise<TranslationStatus>;
    chapter(request: TranslationChapterRequest): Promise<ChapterTranslation>;
    glossary(query: InstructionRequest): Promise<GlossaryPage>;
    editGlossary(request: GlossaryEditRequest): Promise<void>;
    instruction(request: InstructionRequest): Promise<TranslationInstruction>;
    saveInstruction(request: InstructionSaveRequest): Promise<TranslationInstruction>;
    resetInstruction(request: InstructionRequest): Promise<TranslationInstruction>;
    planContent(request: ContentRunRequest): Promise<ContentRunPlan>;
    startContent(request: ContentRunRequest): Promise<void>;
    planGlossary(request: GlossaryRunRequest): Promise<GlossaryRunPlan>;
    startGlossary(request: GlossaryRunRequest): Promise<void>;
    cancel(novelId: string): Promise<void>;
    save(request: TranslationSaveRequest): Promise<ChapterTranslation>;
    onProgress(listener: (progress: TranslationProgress) => void): () => void;
    onChanged(listener: (event: TranslationChanged) => void): () => void;
  };
  dev: {
    crash(kind: DevCrashKind): Promise<void>;
  };
}

declare global {
  interface Window {
    dreamer: DreamerApi;
  }
}
