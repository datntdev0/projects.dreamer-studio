import { app } from 'electron';
import { AppSettings } from '@dreamer/shared/models/settings';
import { CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { LlmCliStatus } from '@dreamer/shared/models/llm';
import { checkDatabase } from '@storage/database';
import { devFailMigration, loadMigrations, Migration } from '@storage/migrator';
import { AppPaths, defaultAppDataRoot, migrationsDir, settingsFilePath } from '@storage/paths';
import { BackendProvider } from '../backend/backend-provider';
import { AnalysisRuns } from '../features/analysis/analysis-runs';
import { AnalysisService } from '../features/analysis/analysis-service';
import { AnalysisSnapshots } from '../features/analysis/analysis-snapshot';
import { WorldAnalysisPipeline } from '../features/analysis/world-analysis-pipeline';
import { registerBuiltInChecks } from '../features/diagnostics/built-in-checks';
import { CheckContext } from '../features/diagnostics/self-check';
import { SelfCheckEngine } from '../features/diagnostics/self-check-engine';
import { registerLibraryChecks } from '../features/library/library-checks';
import { NovelExportPipeline } from '../features/library/novel/novel-export-pipeline';
import { NovelImportPipeline } from '../features/library/novel/novel-import-pipeline';
import { ADAPTERS } from '../features/llm/llm-adapter';
import { registerLlmChecks } from '../features/llm/llm-checks';
import { LlmDetector } from '../features/llm/llm-detector';
import { LlmProcessProvider } from '../features/llm/llm-process';
import { LlmRunner } from '../features/llm/llm-runner';
import { LlmService } from '../features/llm/llm-service';
import { DemoPipeline } from '../features/pipelines/demo-pipeline';
import { PipelineDefinition } from '../features/pipelines/pipeline-definition';
import { PipelineRegistry } from '../features/pipelines/pipeline-registry';
import { WorkSlots } from '../features/pipelines/work-slots';
import { SettingsLoadResult, SettingsStore } from '../features/settings/settings-store';
import { ContentTranslationPipeline } from '../features/translation/content-translation-pipeline';
import { GlossaryTranslationPipeline } from '../features/translation/glossary-translation-pipeline';
import { TranslationRuns } from '../features/translation/translation-runs';
import { TranslationService } from '../features/translation/translation-service';
import { AnalysisController } from '../ipc/analysis-controller';
import { AppController } from '../ipc/app-controller';
import { BackendController } from '../ipc/backend-controller';
import { BroadcastProvider } from '../ipc/broadcast-provider';
import { DevController } from '../ipc/dev-controller';
import { DiagnosticsController } from '../ipc/diagnostics-controller';
import { IpcController } from '../ipc/ipc-controller';
import { LibraryController } from '../ipc/library-controller';
import { LlmController } from '../ipc/llm-controller';
import { LogController } from '../ipc/log-controller';
import { PipelineController } from '../ipc/pipeline-controller';
import { SettingsController } from '../ipc/settings-controller';
import { TranslationController } from '../ipc/translation-controller';
import { LogProvider } from '../logging/log-provider';
import { createLogger, Logger, logProvider } from '../logging/logger';
import { AppDataManager } from './app-data-manager';
import { AppDataSession } from './app-data-session';
import { i18nProvider } from './app-i18n';
import { ErrorProvider } from './error-provider';
import { I18nProvider } from './i18n-provider';
import { WindowProvider } from './window-provider';

const backendPingTimeoutMs: number = 3000;

export class AppRoot {
  readonly logging: LogProvider = logProvider;
  readonly i18n: I18nProvider = i18nProvider;
  readonly broadcaster: BroadcastProvider = new BroadcastProvider();
  readonly settings: SettingsStore = new SettingsStore(settingsFilePath(), defaultAppDataRoot());
  readonly settingsLoad: SettingsLoadResult = this.settings.load();
  readonly window: WindowProvider = new WindowProvider();
  readonly errors: ErrorProvider = new ErrorProvider(this.i18n, this.logging, this.broadcaster);
  readonly backend: BackendProvider = new BackendProvider(this.broadcaster);
  readonly llm: LlmService = this.createLlm();
  readonly chapterSlots: WorkSlots = new WorkSlots((): number => this.settings.get().pipelines.maxChapters);
  readonly snapshots: AnalysisSnapshots = new AnalysisSnapshots();
  readonly analysisRuns: AnalysisRuns = new AnalysisRuns(this.broadcaster);
  readonly translationRuns: TranslationRuns = new TranslationRuns(this.broadcaster);
  readonly manager: AppDataManager;
  readonly analysis: AnalysisService;
  readonly translation: TranslationService;
  readonly diagnostics: SelfCheckEngine;

  constructor(onReopenFailed: (error: unknown, paths: AppPaths) => Promise<void>) {
    this.i18n.setLanguage(this.settings.get().language);
    this.manager = new AppDataManager(this.settings, {
      migrations: (): Migration[] => this.migrations(),
      registry: new PipelineRegistry(this.pipelines()),
      limit: (): number => this.settings.get().pipelines.maxConcurrent,
      broadcaster: this.broadcaster,
      startBackend: (paths: AppPaths): Promise<void> => this.backend.start(paths),
      stopBackend: (): void => this.backend.stop(),
      onReopenFailed,
    });
    const session: () => AppDataSession = (): AppDataSession => this.manager.session();
    this.analysis = new AnalysisService(session, this.llm, this.settings, this.analysisRuns, this.snapshots);
    this.translation = new TranslationService(
      session,
      this.llm,
      this.settings,
      this.translationRuns,
      this.snapshots,
      this.analysisRuns,
      this.broadcaster,
    );
    this.diagnostics = new SelfCheckEngine((): CheckContext => this.checkContext(), createLogger('diagnostics'));
    registerBuiltInChecks(this.diagnostics);
    registerLibraryChecks(this.diagnostics);
    registerLlmChecks(this.diagnostics);
    this.settings.onChange((value: AppSettings): void => {
      this.i18n.setLanguage(value.language);
      this.manager.current()?.executor.limitChanged();
      this.chapterSlots.limitChanged();
    });
  }

  controllers(): IpcController[] {
    const session: () => AppDataSession = (): AppDataSession => this.manager.session();
    return [
      new AppController(this.manager, this.broadcaster),
      new PipelineController((): AppDataSession['executor'] => session().executor),
      new LibraryController(session),
      new LlmController(this.llm, this.broadcaster),
      new AnalysisController(this.analysis),
      new TranslationController(this.translation),
      new SettingsController(this.settings, this.broadcaster),
      new BackendController(this.backend),
      new DiagnosticsController(this.diagnostics),
      new LogController(this.logging),
      new DevController(),
    ];
  }

  dispose(): void {
    this.llm.abortTests();
    this.manager.current()?.executor.cancelAll('appClosed');
    this.backend.stop();
  }

  private createLlm(): LlmService {
    const cli: LlmProcessProvider = new LlmProcessProvider();
    const logger: Logger = createLogger('llm');
    return new LlmService(
      this.settings,
      (): AppPaths => this.manager.paths(),
      new LlmDetector(cli, ADAPTERS, logger),
      new LlmRunner(cli, logger),
      ADAPTERS,
      logger,
    );
  }

  private pipelines(): PipelineDefinition[] {
    const pipelines: PipelineDefinition[] = [
      new NovelImportPipeline(),
      new NovelExportPipeline(),
      new WorldAnalysisPipeline(this.llm, this.settings, this.analysisRuns, this.chapterSlots, this.snapshots),
      new GlossaryTranslationPipeline(this.llm, this.settings, this.translationRuns, this.snapshots, this.broadcaster),
      new ContentTranslationPipeline(
        this.llm,
        this.settings,
        this.translationRuns,
        this.snapshots,
        this.chapterSlots,
        this.broadcaster,
      ),
    ];
    return app.isPackaged ? pipelines : [new DemoPipeline(this.backend), ...pipelines];
  }

  private migrations(): Migration[] {
    const migrations: Migration[] = loadMigrations(migrationsDir());
    if (!app.isPackaged && process.env.DREAMER_DEV_FAIL_MIGRATION === '1') {
      migrations.push(devFailMigration);
    }
    return migrations;
  }

  private checkContext(): CheckContext {
    const session: AppDataSession = this.manager.session();
    return {
      paths: session.paths,
      checkDatabase: (): CheckOutcome => checkDatabase(session.db),
      settings: this.settingsLoad,
      backend: this.backend.status().state,
      pingBackend: (): Promise<boolean> => this.backend.ping(backendPingTimeoutMs),
      llmStatus: (): Promise<LlmCliStatus[]> => this.llm.status(),
    };
  }
}
