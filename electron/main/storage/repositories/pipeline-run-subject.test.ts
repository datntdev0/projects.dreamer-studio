import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { Database } from '../database';
import { loadMigrations, Migration, runMigrations } from '../migrator';
import { PipelineRunRepository } from './pipeline-run-repository';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

interface ColumnRow {
  name: string;
}

const migrationsDir: string = join(__dirname, '..', 'migrations');
let tempDir: string;
let db: Database;
let repository: PipelineRunRepository;

function makeRun(id: string, label: string | null = null): PipelineRun {
  return {
    id,
    type: 'novel-import',
    status: 'queued',
    cancelReason: null,
    progress: 0,
    stepIndex: 0,
    stepCount: 3,
    stepName: null,
    errorCode: null,
    error: null,
    createdAt: '2026-10-22T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    label,
    novelId: null,
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-pipeline-subject-'));
  db = Database.open(join(tempDir, 'database.sqlite'));
  repository = new PipelineRunRepository(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('pipeline run subject migration', () => {
  it('migrates a 0.0.0 database, adds both nullable columns and keeps existing rows', () => {
    const migrations: Migration[] = loadMigrations(migrationsDir);
    const oldMigrations: Migration[] = migrations.filter(
      (migration: Migration): boolean => migration.version === '0.0.0',
    );
    runMigrations(db, oldMigrations, join(tempDir, 'old.backup.sqlite'));
    const oldRun: PipelineRun = makeRun('existing', null);
    db.run(
      `INSERT INTO pipeline_run (id, type, status, params, progress, step_index, step_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [oldRun.id, oldRun.type, oldRun.status, '{}', 0, 0, oldRun.stepCount, oldRun.createdAt],
    );

    runMigrations(db, migrations, join(tempDir, 'upgrade.backup.sqlite'));

    const columns: string[] = db
      .all<ColumnRow>('PRAGMA table_info(pipeline_run)')
      .map((row: ColumnRow): string => row.name);
    expect(columns).toEqual(expect.arrayContaining(['label', 'novel_id']));
    expect(repository.get('existing')).toEqual(oldRun);
  });
});

describe('PipelineRunRepository subject fields', () => {
  beforeEach(() => {
    runMigrations(db, loadMigrations(migrationsDir), join(tempDir, 'backup.sqlite'));
  });

  it('round-trips label on insert and novelId on update', () => {
    const run: PipelineRun = makeRun('new', 'The Mountain Traveller');
    repository.insert(run, { request: { path: 'sample.zip' } });
    expect(repository.get(run.id)).toEqual(run);

    const updated: PipelineRun = { ...run, novelId: randomUUID(), progress: 100, status: 'succeeded' };
    repository.update(updated);
    expect(repository.get(run.id)).toEqual(updated);
  });
});
