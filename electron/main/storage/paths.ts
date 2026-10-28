import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';

export interface AppPaths {
  settingsFile: string;
  root: string;
  database: string;
  databaseBackup: string;
  library: string;
  logs: string;
  pipelineLogs: string;
  promptLogs: string;
  cache: string;
  llmCache: string;
}

export function defaultAppDataRoot(): string {
  return join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'DreamerStudio');
}

export function settingsFilePath(): string {
  return join(defaultAppDataRoot(), 'settings.json');
}

export function resolveAppPaths(root: string): AppPaths {
  const logs: string = join(root, 'logs');
  return {
    settingsFile: settingsFilePath(),
    root,
    database: join(root, 'database.sqlite'),
    databaseBackup: join(root, 'database.backup.sqlite'),
    library: join(root, 'library'),
    logs,
    pipelineLogs: join(logs, 'pipelines'),
    promptLogs: join(logs, 'prompts'),
    cache: join(root, 'cache'),
    llmCache: join(root, 'cache', 'llm'),
  };
}

export function ensureFolders(paths: AppPaths): void {
  for (const folder of [paths.library, paths.logs, paths.cache]) {
    try {
      mkdirSync(folder, { recursive: true });
    } catch (error) {
      throw new CodedError(ErrorCode.AppDataUnwritable, `${folder}: ${errorMessage(error)}`, folder);
    }
  }
}

export function migrationsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'main', 'storage', 'migrations');
}

function resourceFile(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name);
}

export function ontologyDefaultFile(): string {
  return resourceFile('ontology.format.yml');
}

export function packageFormatFile(): string {
  return resourceFile('package.format.yml');
}
