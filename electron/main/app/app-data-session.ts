import { LibraryChannel } from '@dreamer/shared/ipc/channels';
import { AppDataStep } from '@dreamer/shared/models/app-data';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { broadcast } from '../ipc/broadcast';
import { initLogging } from '../logging/logger';
import { cleanLibrary } from '../features/library/library-cleanup';
import { LibraryIndex } from '../features/library/library-index';
import { LibraryService } from '../features/library/library-service';
import { PipelineExecutor } from '../features/pipelines/pipeline-executor';
import { PipelineRegistry } from '../features/pipelines/pipeline-registry';
import { Database } from '@storage/database';
import { Migration, runMigrations } from '@storage/migrator';
import { AppPaths, ensureFolders, resolveAppPaths } from '@storage/paths';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';

export interface AppDataSessionDeps {
  migrations: () => Migration[];
  registry: PipelineRegistry;
  limit: () => number;
}

function refreshImported(index: LibraryIndex, notify: (novelIds: string[]) => void, run: PipelineRun): void {
  if (run.type === 'novel-import' && run.status === 'succeeded' && run.novelId !== null) {
    index.refresh(run.novelId);
    notify([run.novelId]);
  }
}

const libraryChangeRunTypes: PipelineRun['type'][] = ['world-analysis', 'content-translation', 'glossary-translation'];

function refreshLibrary(notify: (novelIds: string[]) => void, run: PipelineRun): void {
  if (libraryChangeRunTypes.includes(run.type) && run.novelId !== null) notify([run.novelId]);
}

export class AppDataSession {
  private constructor(
    readonly paths: AppPaths,
    readonly db: Database,
    readonly executor: PipelineExecutor,
    readonly index: LibraryIndex,
    readonly library: LibraryService,
    readonly logsWritable: boolean,
  ) {}

  static open(root: string, deps: AppDataSessionDeps, onStep?: (step: AppDataStep) => void): AppDataSession {
    const paths: AppPaths = resolveAppPaths(root);
    onStep?.('folders');
    ensureFolders(paths);
    const logsWritable: boolean = initLogging(paths.logs);
    onStep?.('database');
    const db: Database = Database.open(paths.database);
    try {
      runMigrations(db, deps.migrations(), paths.databaseBackup);
      cleanLibrary(paths);
      const runs: PipelineRunRepository = new PipelineRunRepository(db);
      const executor: PipelineExecutor = new PipelineExecutor(runs, paths, deps.registry, deps.limit);
      executor.recover();
      const index: LibraryIndex = new LibraryIndex(paths);
      index.scan();
      const notify: (novelIds: string[]) => void = (novelIds: string[]): void =>
        broadcast(LibraryChannel.Changed, { novelIds });
      const library: LibraryService = new LibraryService(paths, index, runs, notify);
      executor.onRunFinished((run: PipelineRun): void => {
        refreshImported(index, notify, run);
        refreshLibrary(notify, run);
      });
      return new AppDataSession(paths, db, executor, index, library, logsWritable);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
