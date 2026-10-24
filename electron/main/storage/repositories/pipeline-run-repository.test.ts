import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { PipelineListQuery, PipelinePage, PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import { Database } from '../database';
import { loadMigrations, runMigrations } from '../migrator';
import { PipelineRunRepository } from './pipeline-run-repository';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

let tempDir: string;
let db: Database;
let repository: PipelineRunRepository;

function makeRun(id: string, overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id,
    type: 'demo',
    status: 'queued',
    cancelReason: null,
    progress: 0,
    stepIndex: 0,
    stepCount: 3,
    stepName: null,
    errorCode: null,
    error: null,
    label: null,
    novelId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function seed(id: string, status: PipelineRunStatus, createdAt: string): PipelineRun {
  const run: PipelineRun = makeRun(id, { status, createdAt });
  repository.insert(run, {});
  return run;
}

function makeQuery(overrides: Partial<PipelineListQuery> = {}): PipelineListQuery {
  return { finished: null, statuses: [], types: [], limit: 50, after: null, ...overrides };
}

function listIds(query: PipelineListQuery): string[] {
  return repository.list(query).runs.map((run: PipelineRun) => run.id);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-pipeline-repo-'));
  db = Database.open(join(tempDir, 'database.sqlite'));
  runMigrations(db, loadMigrations(join(__dirname, '..', 'migrations')), join(tempDir, 'database.backup.sqlite'));
  repository = new PipelineRunRepository(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('PipelineRunRepository', () => {
  it('round-trips a run through insert and get', () => {
    const run: PipelineRun = makeRun('a', {
      status: 'failed',
      cancelReason: null,
      progress: 40,
      stepIndex: 1,
      stepName: 'prepare',
      errorCode: ErrorCode.PipelineUnknownType,
      error: 'boom',
      label: 'Imported novel',
      startedAt: '2026-01-01T00:00:01.000Z',
      finishedAt: '2026-01-01T00:00:02.000Z',
    });
    repository.insert(run, { failAtStep: 1 });
    expect(repository.get('a')).toEqual(run);
    expect(repository.get('missing')).toBeNull();
  });

  it('updates the mutable columns', () => {
    const run: PipelineRun = seed('a', 'queued', '2026-01-01T00:00:00.000Z');
    const updated: PipelineRun = {
      ...run,
      status: 'cancelled',
      cancelReason: 'user',
      progress: 55,
      stepIndex: 2,
      stepName: 'render',
      errorCode: ErrorCode.DbQueryFailed,
      error: 'failed',
      novelId: 'novel-a',
      startedAt: '2026-01-01T00:00:01.000Z',
      finishedAt: '2026-01-01T00:00:03.000Z',
    };
    repository.update(updated);
    expect(repository.get('a')).toEqual(updated);
  });

  it('filters by finished, statuses and types', () => {
    seed('q', 'queued', '2026-01-01T00:00:01.000Z');
    seed('r', 'running', '2026-01-01T00:00:02.000Z');
    seed('s', 'succeeded', '2026-01-01T00:00:03.000Z');
    seed('f', 'failed', '2026-01-01T00:00:04.000Z');
    seed('c', 'cancelled', '2026-01-01T00:00:05.000Z');
    expect(listIds(makeQuery({ finished: true }))).toEqual(['c', 'f', 's']);
    expect(listIds(makeQuery({ finished: false }))).toEqual(['r', 'q']);
    expect(listIds(makeQuery({ finished: null }))).toEqual(['c', 'f', 's', 'r', 'q']);
    expect(listIds(makeQuery({ statuses: ['failed', 'queued'] }))).toEqual(['f', 'q']);
    expect(listIds(makeQuery({ types: ['demo'] }))).toHaveLength(5);
    expect(listIds(makeQuery({ finished: true, statuses: ['failed'] }))).toEqual(['f']);
  });

  it('pages newest first with a keyset cursor and a stable total', () => {
    for (let index: number = 1; index <= 5; index++) {
      seed(`run-${index}`, 'succeeded', `2026-01-01T00:00:0${index}.000Z`);
    }
    const first: PipelinePage = repository.list(makeQuery({ limit: 2 }));
    const second: PipelinePage = repository.list(makeQuery({ limit: 2, after: first.next }));
    const third: PipelinePage = repository.list(makeQuery({ limit: 2, after: second.next }));
    const ids = (page: PipelinePage): string[] => page.runs.map((run: PipelineRun) => run.id);
    expect(ids(first)).toEqual(['run-5', 'run-4']);
    expect(ids(second)).toEqual(['run-3', 'run-2']);
    expect(ids(third)).toEqual(['run-1']);
    expect([first.total, second.total, third.total]).toEqual([5, 5, 5]);
    expect(first.next).toEqual({ createdAt: '2026-01-01T00:00:04.000Z', id: 'run-4' });
    expect(third.next).toBeNull();
  });

  it('cancels only active runs and returns their ids', () => {
    seed('q', 'queued', '2026-01-01T00:00:01.000Z');
    seed('r', 'running', '2026-01-01T00:00:02.000Z');
    const done: PipelineRun = seed('s', 'succeeded', '2026-01-01T00:00:03.000Z');
    const finishedAt: string = '2026-01-02T00:00:00.000Z';
    expect(
      repository
        .markActiveCancelled('appClosed', finishedAt)
        .map((run) => run.id)
        .sort(),
    ).toEqual(['q', 'r']);
    for (const id of ['q', 'r']) {
      expect(repository.get(id)).toMatchObject({ status: 'cancelled', cancelReason: 'appClosed', finishedAt });
    }
    expect(repository.get('s')).toEqual(done);
  });

  it('deletes only finished runs', () => {
    seed('q', 'queued', '2026-01-01T00:00:01.000Z');
    seed('s', 'succeeded', '2026-01-01T00:00:02.000Z');
    seed('f', 'failed', '2026-01-01T00:00:03.000Z');
    expect(repository.deleteFinished(['q', 's', 'f', 'unknown']).sort()).toEqual(['f', 's']);
    expect(repository.get('q')).not.toBeNull();
    expect(repository.get('s')).toBeNull();
    expect(repository.get('f')).toBeNull();
  });

  it('rejects an invalid status', () => {
    const run: PipelineRun = makeRun('a', { status: 'bogus' as PipelineRunStatus });
    expect(() => repository.insert(run, {})).toThrow(CodedError);
    try {
      repository.insert(run, {});
    } catch (error) {
      expect((error as CodedError).code).toBe(ErrorCode.DbQueryFailed);
    }
  });
});
