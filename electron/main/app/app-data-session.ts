import { AppDataStep } from '@dreamer/shared/models/app-data';
import { initLogging } from '../logging/logger';
import { PipelineExecutor } from '../features/pipelines/pipeline-executor';
import { PipelineRegistry } from '../features/pipelines/pipeline-registry';
import { Database } from '../storage/database';
import { Migration, runMigrations } from '../storage/migrator';
import { AppPaths, ensureFolders, resolveAppPaths } from '../storage/paths';
import { PipelineRunRepository } from '../storage/repositories/pipeline-run-repository';

export interface AppDataSessionDeps {
  migrations: () => Migration[];
  registry: PipelineRegistry;
  limit: () => number;
}

export class AppDataSession {
  private constructor(
    readonly paths: AppPaths,
    readonly db: Database,
    readonly executor: PipelineExecutor,
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
      const executor: PipelineExecutor = new PipelineExecutor(
        new PipelineRunRepository(db),
        paths,
        deps.registry,
        deps.limit,
      );
      executor.recover();
      return new AppDataSession(paths, db, executor, logsWritable);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
