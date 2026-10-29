import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';
import { AppError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { AnalysisChannel, AppChannel, AppDataChannel, BackendChannel, DevChannel } from '@dreamer/shared/ipc/channels';
import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import {
  DiagnosticsChannel,
  LibraryChannel,
  LlmChannel,
  LogChannel,
  PipelineChannel,
  SettingsChannel,
} from '@dreamer/shared/ipc/channels';
import { DevCrashKind } from '@dreamer/shared/ipc/dev';
import { DreamerApi } from '@dreamer/shared/ipc/dreamer-api';
import { IpcResult } from '@dreamer/shared/ipc/ipc-result';
import { LogEntry } from '@dreamer/shared/ipc/log';
import { AboutLink } from '@dreamer/shared/models/about';
import { AnalysisChanged, AnalysisEditRequest, AnalysisPlan } from '@dreamer/shared/models/analysis';
import { AnalysisProgress, AnalysisRunRequest } from '@dreamer/shared/models/analysis';
import { AnalysisStatus, OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import { Occurrence, OccurrenceQuery, ReviewQuery, World, WorldQuery } from '@dreamer/shared/models/analysis';
import { QuoteMatch, QuoteQuery } from '@dreamer/shared/models/analysis';
import {
  WorldEditPreview,
  WorldEditScope,
  WorldPreviewRequest,
  WorldScopeRequest,
} from '@dreamer/shared/models/analysis';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { LlmCliId, LlmCliStatus, LlmPathRequest, LlmTestResult } from '@dreamer/shared/models/llm';
import { PipelineListQuery, PipelineLogChunk, PipelinePage } from '@dreamer/shared/models/pipeline';
import { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { DeleteNovelsResult } from '@dreamer/shared/models/novel';
import { ChapterChangeRequest, ChapterRequest, ChapterText } from '@dreamer/shared/models/novel';
import { SearchProgress, SearchRequest } from '@dreamer/shared/models/novel';
import { LibraryChangedEvent, NovelDetail, NovelPatch, NovelSummary } from '@dreamer/shared/models/novel';
import { NovelImportRequest, PackageReadResult, PickedImage } from '@dreamer/shared/models/novel-package';
import { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import { ContentRunPlan, ContentRunRequest } from '@dreamer/shared/models/translation';
import { GlossaryPage, InstructionRequest, InstructionSaveRequest } from '@dreamer/shared/models/translation';
import { GlossaryRunPlan, GlossaryRunRequest } from '@dreamer/shared/models/translation';
import { TranslationChanged, TranslationInstruction, TranslationProgress } from '@dreamer/shared/models/translation';
import { TranslationStatus, TranslationStatusQuery } from '@dreamer/shared/models/translation';

function unavailable(message: string): Promise<never> {
  return Promise.reject({
    code: ErrorCode.NotImplemented,
    message,
  } satisfies AppError);
}

function analysisUnavailable(): Promise<never> {
  return unavailable('Analysis is available in the prototype only.');
}

function translationUnavailable(): Promise<never> {
  return unavailable('Translation runs are not implemented yet.');
}

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return (): void => {
    ipcRenderer.removeListener(channel, handler);
  };
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result: IpcResult<T> = await ipcRenderer.invoke(channel, ...args);
  if ('error' in result) {
    throw result.error;
  }
  return result.value;
}

const api: DreamerApi = {
  app: {
    info: (): Promise<AppInfo> => call(AppChannel.Info),
    openLogs: (): Promise<void> => call(AppChannel.OpenLogs),
    openDataDir: (): Promise<void> => call(AppChannel.OpenDataDir),
    openLink: (link: AboutLink): Promise<void> => call(AppChannel.OpenLink, link),
    onError: (listener: (error: AppError) => void): (() => void) => subscribe(AppChannel.Error, listener),
  },
  log: {
    write: (entry: LogEntry): void => ipcRenderer.send(LogChannel.Write, entry),
  },
  backend: {
    status: (): Promise<BackendStatus> => call(BackendChannel.GetStatus),
    onStatus: (listener: (status: BackendStatus) => void): (() => void) => subscribe(BackendChannel.Status, listener),
  },
  pipeline: {
    types: (): Promise<PipelineTypeInfo[]> => call(PipelineChannel.Types),
    start: (request: PipelineStartRequest): Promise<PipelineRun> => call(PipelineChannel.Start, request),
    cancel: (id: string): Promise<void> => call(PipelineChannel.Cancel, id),
    list: (query: PipelineListQuery): Promise<PipelinePage> => call(PipelineChannel.List, query),
    get: (id: string): Promise<PipelineRun> => call(PipelineChannel.Get, id),
    log: (id: string): Promise<string[]> => call(PipelineChannel.GetLog, id),
    delete: (ids: string[]): Promise<string[]> => call(PipelineChannel.Delete, ids),
    onUpdate: (listener: (run: PipelineRun) => void): (() => void) => subscribe(PipelineChannel.Update, listener),
    onDeleted: (listener: (ids: string[]) => void): (() => void) => subscribe(PipelineChannel.Deleted, listener),
    onLog: (listener: (chunk: PipelineLogChunk) => void): (() => void) => subscribe(PipelineChannel.Log, listener),
  },
  settings: {
    get: (): Promise<SettingsState> => call(SettingsChannel.Get),
    update: (patch: SettingsPatch): Promise<AppSettings> => call(SettingsChannel.Update, patch),
    reset: (section: SettingsSection): Promise<AppSettings> => call(SettingsChannel.Reset, section),
    onChanged: (listener: (settings: AppSettings) => void): (() => void) =>
      subscribe(SettingsChannel.Changed, listener),
  },
  llm: {
    status: (): Promise<LlmCliStatus[]> => call(LlmChannel.Status),
    detect: (): Promise<LlmCliStatus[]> => call(LlmChannel.Detect),
    test: (cli: LlmCliId): Promise<LlmTestResult> => call(LlmChannel.Test, cli),
    pickPath: (cli: LlmCliId): Promise<string | null> => call(LlmChannel.PickPath, cli),
    setPath: (request: LlmPathRequest): Promise<LlmCliStatus> => call(LlmChannel.SetPath, request),
    onChanged: (listener: (statuses: LlmCliStatus[]) => void): (() => void) => subscribe(LlmChannel.Changed, listener),
  },
  appData: {
    pickFolder: (): Promise<string | null> => call(AppDataChannel.PickFolder),
    inspect: (path: string): Promise<AppDataCandidate> => call(AppDataChannel.Inspect, path),
    switch: (path: string): Promise<AppInfo> => call(AppDataChannel.Switch, path),
    status: (): Promise<AppDataStatus> => call(AppDataChannel.Status),
    onProgress: (listener: (step: AppDataStep) => void): (() => void) => subscribe(AppDataChannel.Progress, listener),
    onChanged: (listener: (info: AppInfo) => void): (() => void) => subscribe(AppDataChannel.Changed, listener),
  },
  diagnostics: {
    run: (): Promise<DiagnosticsRun> => call(DiagnosticsChannel.Run),
  },
  library: {
    pickPackage: (): Promise<string | null> => call(LibraryChannel.PickPackage),
    readPackage: (path: string): Promise<PackageReadResult> => call(LibraryChannel.ReadPackage, path),
    pickImage: (): Promise<PickedImage | null> => call(LibraryChannel.PickImage),
    import: (request: NovelImportRequest): Promise<PipelineRun> => call(LibraryChannel.Import, request),
    export: (id: string): Promise<PipelineRun | null> => call(LibraryChannel.Export, id),
    showExport: (runId: string): Promise<void> => call(LibraryChannel.ShowExport, runId),
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
    list: (): Promise<NovelSummary[]> => call(LibraryChannel.List),
    get: (id: string): Promise<NovelDetail> => call(LibraryChannel.Get, id),
    getChapter: (request: ChapterRequest): Promise<ChapterText> => call(LibraryChannel.GetChapter, request),
    search: (request: SearchRequest): Promise<void> => call(LibraryChannel.Search, request),
    cancelSearch: (searchId: string): Promise<void> => call(LibraryChannel.SearchCancel, searchId),
    onSearchProgress: (listener: (progress: SearchProgress) => void): (() => void) =>
      subscribe(LibraryChannel.SearchProgress, listener),
    updateNovel: (id: string, patch: NovelPatch): Promise<NovelDetail> =>
      call(LibraryChannel.UpdateNovel, { id, patch }),
    changeChapters: (request: ChapterChangeRequest): Promise<NovelDetail> =>
      call(LibraryChannel.ChangeChapters, request),
    deleteNovels: (ids: string[]): Promise<DeleteNovelsResult> => call(LibraryChannel.DeleteNovels, ids),
    openFolder: (id: string): Promise<void> => call(LibraryChannel.OpenFolder, id),
    onChanged: (listener: (event: LibraryChangedEvent) => void): (() => void) =>
      subscribe(LibraryChannel.Changed, listener),
  },
  analysis: {
    status: (novelId: string): Promise<AnalysisStatus> => call(AnalysisChannel.Status, novelId),
    chapter: analysisUnavailable,
    plan: (request: AnalysisRunRequest): Promise<AnalysisPlan> => call(AnalysisChannel.Plan, request),
    start: (request: AnalysisRunRequest): Promise<void> => call(AnalysisChannel.Start, request),
    cancel: (novelId: string): Promise<void> => call(AnalysisChannel.Cancel, novelId),
    world: (query: WorldQuery): Promise<World> => call(AnalysisChannel.World, query),
    review: (query: ReviewQuery): Promise<ReviewPage> => call(AnalysisChannel.Review, query),
    occurrences: (query: OccurrenceQuery): Promise<Occurrence[]> => call(AnalysisChannel.Occurrences, query),
    edit: (request: AnalysisEditRequest): Promise<void> => call(AnalysisChannel.Edit, request),
    scope: (request: WorldScopeRequest): Promise<WorldEditScope> => call(AnalysisChannel.Scope, request),
    preview: (request: WorldPreviewRequest): Promise<WorldEditPreview> => call(AnalysisChannel.Preview, request),
    findQuote: (query: QuoteQuery): Promise<QuoteMatch[]> => call(AnalysisChannel.FindQuote, query),
    ontologyOpen: (novelId: string): Promise<void> => call(AnalysisChannel.OntologyOpen, novelId),
    ontologyReset: (novelId: string): Promise<OntologyProblem[]> => call(AnalysisChannel.OntologyReset, novelId),
    ontologyCheck: (novelId: string): Promise<OntologyProblem[]> => call(AnalysisChannel.OntologyCheck, novelId),
    onProgress: (listener: (progress: AnalysisProgress) => void): (() => void) =>
      subscribe(AnalysisChannel.Progress, listener),
    onChanged: (listener: (event: AnalysisChanged) => void): (() => void) =>
      subscribe(AnalysisChannel.Changed, listener),
  },
  translation: {
    status: (query: TranslationStatusQuery): Promise<TranslationStatus> => call(TranslationChannel.Status, query),
    chapter: translationUnavailable,
    glossary: (query: InstructionRequest): Promise<GlossaryPage> => call(TranslationChannel.Glossary, query),
    editGlossary: (request: GlossaryEditRequest): Promise<void> => call(TranslationChannel.EditGlossary, request),
    instruction: (request: InstructionRequest): Promise<TranslationInstruction> =>
      call(TranslationChannel.Instruction, request),
    saveInstruction: (request: InstructionSaveRequest): Promise<TranslationInstruction> =>
      call(TranslationChannel.SaveInstruction, request),
    resetInstruction: (request: InstructionRequest): Promise<TranslationInstruction> =>
      call(TranslationChannel.ResetInstruction, request),
    planContent: (request: ContentRunRequest): Promise<ContentRunPlan> => call(TranslationChannel.PlanContent, request),
    startContent: (request: ContentRunRequest): Promise<void> => call(TranslationChannel.StartContent, request),
    planGlossary: (request: GlossaryRunRequest): Promise<GlossaryRunPlan> =>
      call(TranslationChannel.PlanGlossary, request),
    startGlossary: (request: GlossaryRunRequest): Promise<void> => call(TranslationChannel.StartGlossary, request),
    cancel: (novelId: string): Promise<void> => call(TranslationChannel.Cancel, novelId),
    save: translationUnavailable,
    onProgress: (listener: (progress: TranslationProgress) => void): (() => void) =>
      subscribe(TranslationChannel.Progress, listener),
    onChanged: (listener: (event: TranslationChanged) => void): (() => void) =>
      subscribe(TranslationChannel.Changed, listener),
  },
  dev: {
    crash: (kind: DevCrashKind): Promise<void> => call(DevChannel.Crash, kind),
  },
};

contextBridge.exposeInMainWorld('dreamer', api);
