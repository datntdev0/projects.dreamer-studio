import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppDataCandidate, AppDataStep } from '@dreamer/shared/models/app-data';
import { PipelineListQuery } from '@dreamer/shared/models/pipeline';
import { PipelineDefinition } from '../pipelines/pipeline-definition';
import { PipelineRegistry } from '../pipelines/pipeline-registry';
import { SettingsStore } from '../settings/settings-store';
import { Database } from '../storage/database';
import { loadMigrations, Migration, runMigrations } from '../storage/migrator';
import { AppPaths } from '../storage/paths';
import { AppDataManager, AppDataManagerDeps } from './app-data-manager';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  initLogging: vi.fn(() => true),
}));
vi.mock('../ipc/broadcast', () => ({ broadcast: vi.fn() }));

const allRuns: PipelineListQuery = { finished: null, statuses: [], types: [], limit: 50, after: null };
const startRequest = { type: 'demo', failAtStep: null } as const;

let tempDir: string;
let folderA: string;
let folderB: string;
let settings: SettingsStore;
let manager: AppDataManager;
let deps: AppDataManagerDeps;
let migrations: Migration[];
let releases: Array<() => void>;
let managers: AppDataManager[];

function gatedDefinition(): PipelineDefinition {
  return {
    type: 'demo',
    steps: [
      {
        key: 'gate',
        backend: false,
        run: (): Promise<void> => new Promise<void>((resolve) => releases.push(resolve)),
      },
    ],
    cleanup: vi.fn().mockResolvedValue(undefined) as unknown as PipelineDefinition['cleanup'],
  };
}

function newManager(settingsStore: SettingsStore = settings): AppDataManager {
  const created: AppDataManager = new AppDataManager(settingsStore, deps);
  managers.push(created);
  return created;
}

function newFolder(name: string): string {
  const folder: string = join(tempDir, name);
  mkdirSync(folder);
  return folder;
}

async function finishRun(target: AppDataManager): Promise<string> {
  const run = target.session().executor.start(startRequest);
  await vi.waitFor((): void => expect(releases.length).toBeGreaterThan(0), { timeout: 3000, interval: 5 });
  releases.shift()?.();
  await vi.waitFor((): void => expect(target.session().executor.get(run.id).status).toBe('succeeded'), {
    timeout: 3000,
    interval: 5,
  });
  return run.id;
}

async function folderWithRun(name: string): Promise<{ folder: string; runId: string }> {
  const folder: string = newFolder(name);
  const seed: AppDataManager = newManager(new SettingsStore(join(tempDir, `${name}-settings.json`), folder));
  seed.open(folder);
  const runId: string = await finishRun(seed);
  seed.close();
  return { folder, runId };
}

function folderWithMigrations(name: string, subset: Migration[], extraHistoryId: string | null): string {
  const folder: string = newFolder(name);
  const db: Database = Database.open(join(folder, 'database.sqlite'));
  runMigrations(db, subset, join(folder, 'database.backup.sqlite'));
  if (extraHistoryId !== null) {
    db.run('INSERT INTO sys_migration_history (id, version, upgrade_num, applied_at) VALUES (?, ?, ?, ?)', [
      extraHistoryId,
      '999.0.0',
      0,
      '2026-01-01T00:00:00.000Z',
    ]);
  }
  db.close();
  return folder;
}

function runIds(target: AppDataManager): string[] {
  return target
    .session()
    .executor.list(allRuns)
    .runs.map((run) => run.id)
    .sort();
}

function names(folder: string): string[] {
  return readdirSync(folder)
    .filter((name: string) => name !== 'logs' && !name.endsWith('-wal') && !name.endsWith('-shm'))
    .sort();
}

function layout(root: string): Record<string, string[]> {
  return { root: names(root), library: names(join(root, 'library')), cache: names(join(root, 'cache')) };
}

async function failureCode(action: Promise<unknown>): Promise<ErrorCode> {
  try {
    await action;
  } catch (error) {
    return (error as CodedError).code;
  }
  throw new Error('expected a rejection');
}

function sessionError(target: AppDataManager): unknown {
  try {
    target.session();
  } catch (error) {
    return error;
  }
  return null;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-app-data-'));
  folderA = newFolder('a');
  folderB = newFolder('b');
  settings = new SettingsStore(join(tempDir, 'settings.json'), folderA);
  settings.load();
  migrations = loadMigrations(join(__dirname, '..', 'storage', 'migrations'));
  releases = [];
  managers = [];
  deps = {
    migrations: (): Migration[] => migrations,
    registry: new PipelineRegistry([gatedDefinition()]),
    limit: (): number => 1,
    startBackend: vi.fn(async (): Promise<void> => undefined),
    stopBackend: vi.fn(),
    onReopenFailed: vi.fn(async (): Promise<void> => undefined),
  };
  manager = newManager();
  manager.open(folderA);
});

afterEach(() => {
  managers.forEach((created: AppDataManager): void => {
    try {
      created.close();
    } catch {
      // already closed
    }
  });
  rmSync(tempDir, { recursive: true, force: true });
});

describe('AppDataManager', () => {
  it('AC-3: an empty folder gets a new database, has no history, is saved, and reports every step', async () => {
    const steps: AppDataStep[] = [];
    const paths: AppPaths = await manager.switchTo(folderB, (step: AppDataStep): void => {
      steps.push(step);
    });
    expect(paths.root).toBe(folderB);
    expect(existsSync(join(folderB, 'database.sqlite'))).toBe(true);
    expect(runIds(manager)).toEqual([]);
    expect(manager.session().paths.root).toBe(folderB);
    expect(settings.get().appDataDir).toBe(folderB);
    expect(steps).toEqual(expect.arrayContaining(['close', 'folders', 'database', 'backend']));
    expect(deps.stopBackend).toHaveBeenCalledTimes(1);
    expect(deps.startBackend).toHaveBeenCalledTimes(1);
  });

  it('AC-3: a folder with existing data is opened as is and its runs are visible', async () => {
    const { folder, runId } = await folderWithRun('existing');
    await manager.switchTo(folder, vi.fn());
    expect(manager.session().paths.root).toBe(folder);
    expect(runIds(manager)).toEqual([runId]);
    expect(settings.get().appDataDir).toBe(folder);
  });

  it('AC-3: older data is reported as older, then upgraded with a backup', async () => {
    const older: string = folderWithMigrations('older', migrations.slice(0, 1), null);
    const candidate: AppDataCandidate = manager.inspect(older);
    expect(candidate.content).toBe('older');
    expect(candidate.foundVersion).toBe(`${migrations[0].version}_${migrations[0].upgradeNum}`);
    await manager.switchTo(older, vi.fn());
    const applied: string[] = manager
      .session()
      .db.all<{ id: string }>('SELECT id FROM sys_migration_history ORDER BY rowid')
      .map((row) => row.id);
    expect(applied).toEqual(migrations.map((migration: Migration) => migration.id));
    expect(existsSync(join(older, 'database.backup.sqlite'))).toBe(true);
  });

  it('AC-4: newer data fails with DB_NEWER_VERSION, rolls back, and the old folder keeps working', async () => {
    const newer: string = folderWithMigrations('newer', migrations, '999.0.0_0__future');
    const candidate: AppDataCandidate = manager.inspect(newer);
    expect(candidate.content).toBe('newer');
    expect(candidate.foundVersion).toBe('999.0.0_0');
    const steps: AppDataStep[] = [];
    const code: ErrorCode = await failureCode(
      manager.switchTo(newer, (step: AppDataStep): void => {
        steps.push(step);
      }),
    );
    expect(code).toBe(ErrorCode.DbNewerVersion);
    expect(steps).toContain('rollback');
    expect(manager.session().paths.root).toBe(folderA);
    expect(runIds(manager)).toEqual([]);
    const run = manager.session().executor.start(startRequest);
    expect(manager.session().executor.get(run.id).id).toBe(run.id);
    expect(settings.get().appDataDir).toBe(folderA);
  });

  it('AC-5: an active pipeline rejects the switch with APP_DATA_PIPELINES_ACTIVE and nothing closes', async () => {
    manager.session().executor.start(startRequest);
    const steps: AppDataStep[] = [];
    const code: ErrorCode = await failureCode(
      manager.switchTo(folderB, (step: AppDataStep): void => {
        steps.push(step);
      }),
    );
    expect(code).toBe(ErrorCode.AppDataPipelinesActive);
    expect(steps).toEqual([]);
    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(manager.session().paths.root).toBe(folderA);
    expect(existsSync(join(folderB, 'database.sqlite'))).toBe(false);
    expect(settings.get().appDataDir).toBe(folderA);
  });

  it('AC-2: a missing target folder rejects with APP_DATA_UNWRITABLE and stays on the old folder', async () => {
    const steps: AppDataStep[] = [];
    const code: ErrorCode = await failureCode(
      manager.switchTo(join(tempDir, 'missing'), (step: AppDataStep): void => {
        steps.push(step);
      }),
    );
    expect(code).toBe(ErrorCode.AppDataUnwritable);
    expect(steps).toEqual([]);
    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(manager.session().paths.root).toBe(folderA);
    expect(settings.get().appDataDir).toBe(folderA);
  });

  it('AC-6: the old folder keeps the same files (except logs) and the same runs after a switch', async () => {
    const runId: string = await finishRun(manager);
    const filesBefore: Record<string, string[]> = layout(folderA);
    await manager.switchTo(folderB, vi.fn());
    expect(layout(folderA)).toEqual(filesBefore);
    await manager.switchTo(folderA, vi.fn());
    expect(layout(folderA)).toEqual(filesBefore);
    expect(runIds(manager)).toEqual([runId]);
  });

  it('inspect: the current folder is reported as current', () => {
    const candidate: AppDataCandidate = manager.inspect(folderA);
    expect(candidate.current).toBe(true);
    expect(candidate.path).toBe(folderA);
    expect(candidate.writable).toBe(true);
  });

  it('inspect: an empty folder is none with no version, and no file is left behind', () => {
    const candidate: AppDataCandidate = manager.inspect(folderB);
    expect(candidate.content).toBe('none');
    expect(candidate.foundVersion).toBeNull();
    expect(candidate.current).toBe(false);
    expect(candidate.writable).toBe(true);
    expect(candidate.supportedVersion).toEqual(expect.any(String));
    expect(readdirSync(folderB)).toEqual([]);
  });

  it('inspect: a folder with data is not modified', async () => {
    const { folder } = await folderWithRun('existing');
    const before: string[] = readdirSync(folder).sort();
    expect(manager.inspect(folder).content).toBe('current');
    expect(readdirSync(folder).sort()).toEqual(before);
  });

  it('session() rejects with APP_DATA_SWITCHING while a switch is running', async () => {
    const seen: unknown[] = [];
    deps.startBackend = vi.fn(async (): Promise<void> => {
      seen.push(sessionError(manager));
    });
    await manager.switchTo(folderB, (step: AppDataStep): void => {
      if (step === 'database') {
        seen.push(sessionError(manager));
      }
    });
    expect(seen).toHaveLength(2);
    seen.forEach((error: unknown): void => {
      expect((error as CodedError).code).toBe(ErrorCode.AppDataSwitching);
    });
    expect(manager.session().paths.root).toBe(folderB);
  });
});
