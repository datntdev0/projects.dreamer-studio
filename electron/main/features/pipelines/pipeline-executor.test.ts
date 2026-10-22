import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { PipelineListQuery, PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import { Database } from '../../storage/database';
import { loadMigrations, runMigrations } from '../../storage/migrator';
import { PipelineRunRepository } from '../../storage/repositories/pipeline-run-repository';
import { AppPaths, resolveAppPaths } from '../../storage/paths';
import { PipelineDefinition, StepContext, sleep } from './pipeline-definition';
import { PipelineExecutor } from './pipeline-executor';
import { PipelineRegistry } from './pipeline-registry';
import { runLogFile } from './run-log';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../ipc/broadcast', () => ({ broadcast: vi.fn() }));

let tempDir: string;
let paths: AppPaths;
let db: Database;
let repository: PipelineRunRepository;
let executor: PipelineExecutor;
let limit: number;
let cleanup: ReturnType<typeof vi.fn>;

const startRequest = { type: 'demo', failAtStep: null } as const;
const allRuns: PipelineListQuery = { finished: null, statuses: [], types: [], limit: 50, after: null };

function makeDefinition(steps: PipelineDefinition['steps']): PipelineDefinition {
  return { type: 'demo', steps, cleanup: cleanup as unknown as PipelineDefinition['cleanup'] };
}

function sleepStep(key: string, ms: number): PipelineDefinition['steps'][number] {
  return { key, backend: false, run: (ctx: StepContext): Promise<void> => sleep(ms, ctx.signal) };
}

function gatedStep(key: string, releases: Array<() => void>): PipelineDefinition['steps'][number] {
  return {
    key,
    backend: false,
    run: (): Promise<void> => new Promise<void>((resolve) => releases.push(resolve)),
  };
}

function setup(definition: PipelineDefinition): void {
  executor = new PipelineExecutor(repository, paths, new PipelineRegistry([definition]), (): number => limit);
}

function makeRun(id: string, status: PipelineRunStatus): PipelineRun {
  return {
    id,
    type: 'demo',
    status,
    cancelReason: null,
    progress: 0,
    stepIndex: 0,
    stepCount: 2,
    stepName: null,
    errorCode: null,
    error: null,
    label: null,
    novelId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
  };
}

function waitForStatus(id: string, status: PipelineRunStatus): Promise<void> {
  return vi.waitFor((): void => expect(executor.get(id).status).toBe(status), { timeout: 3000, interval: 5 });
}

function readLogText(id: string): string {
  return readFileSync(runLogFile(paths, id), 'utf8');
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-pipeline-executor-'));
  paths = resolveAppPaths(tempDir);
  db = Database.open(join(tempDir, 'database.sqlite'));
  runMigrations(
    db,
    loadMigrations(join(__dirname, '..', '..', 'storage', 'migrations')),
    join(tempDir, 'backup.sqlite'),
  );
  repository = new PipelineRunRepository(db);
  limit = 1;
  cleanup = vi.fn().mockResolvedValue(undefined);
  setup(makeDefinition([sleepStep('first', 20), sleepStep('second', 20)]));
});

afterEach(() => {
  executor.cancelAll('appClosed');
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('PipelineExecutor', () => {
  it('starts a labeled run through startRun', async () => {
    const run: PipelineRun = executor.startRun('demo', { source: 'package.zip' }, 'Imported novel');
    expect(run).toMatchObject({ label: 'Imported novel', novelId: null });
    await waitForStatus(run.id, 'succeeded');
    expect(executor.get(run.id)).toMatchObject({ label: 'Imported novel', novelId: null });
    expect(readLogText(run.id)).toContain('"source":"package.zip"');
  });

  it('exposes the run context and saves the novel id', async () => {
    let contextRunId: string | null = null;
    let contextPaths: AppPaths | null = null;
    let release: () => void = (): void => undefined;
    setup(
      makeDefinition([
        {
          key: 'save',
          backend: false,
          run: async (ctx: StepContext): Promise<void> => {
            contextRunId = ctx.runId;
            contextPaths = ctx.paths;
            ctx.setNovelId('novel-a');
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          },
        },
      ]),
    );
    const run: PipelineRun = executor.start(startRequest);
    await vi.waitFor((): void => expect(executor.get(run.id).novelId).toBe('novel-a'), {
      timeout: 3000,
      interval: 5,
    });
    expect(contextRunId).toBe(run.id);
    expect(contextPaths).toBe(paths);
    expect(executor.get(run.id).status).toBe('running');
    release();
    await waitForStatus(run.id, 'succeeded');
  });

  it('AC-1: start returns a queued run at once and does not block the event loop', async () => {
    setup(makeDefinition([sleepStep('long', 100)]));
    let timerFired: boolean = false;
    setTimeout((): void => {
      timerFired = true;
    }, 10);
    const run: PipelineRun = executor.start(startRequest);
    expect(run.status).toBe('queued');
    await vi.waitFor((): void => expect(timerFired).toBe(true), { timeout: 3000, interval: 5 });
    expect(executor.get(run.id).status).toBe('running');
    await waitForStatus(run.id, 'succeeded');
  });

  it('AC-2: a run goes queued, running, succeeded with progress 100 and timestamps', async () => {
    const run: PipelineRun = executor.start(startRequest);
    expect(run.startedAt).toBeNull();
    await waitForStatus(run.id, 'running');
    expect(executor.get(run.id).startedAt).not.toBeNull();
    await waitForStatus(run.id, 'succeeded');
    const done: PipelineRun = executor.get(run.id);
    expect(done.progress).toBe(100);
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();
  });

  it('AC-3: progress and step fields update and the run log has the step lines', async () => {
    let reported: boolean = false;
    setup(
      makeDefinition([
        {
          key: 'first',
          backend: false,
          run: async (ctx: StepContext): Promise<void> => {
            ctx.progress(50);
            reported = true;
            await sleep(1000, ctx.signal);
          },
        },
        sleepStep('second', 20),
      ]),
    );
    const run: PipelineRun = executor.start(startRequest);
    await vi.waitFor((): void => expect(reported).toBe(true), { timeout: 3000, interval: 5 });
    await vi.waitFor((): void => expect(executor.get(run.id).progress).toBeGreaterThan(0), { timeout: 3000 });
    const during: PipelineRun = executor.get(run.id);
    expect(during.stepIndex).toBe(1);
    expect(during.stepName).toBe('first');
    expect(during.progress).toBeLessThan(100);
    await waitForStatus(run.id, 'succeeded');
    expect(executor.get(run.id)).toMatchObject({ stepIndex: 2, stepName: 'second' });
    const log: string = readLogText(run.id);
    expect(log).toContain('Run started');
    expect(log).toContain('Step 1/2 started: first');
    expect(log).toContain('Step 2/2 started: second');
  });

  it('AC-4: cancel stops a running run and runs cleanup, a queued run is cancelled with no log', async () => {
    setup(makeDefinition([sleepStep('long', 2000)]));
    const running: PipelineRun = executor.start(startRequest);
    const queued: PipelineRun = executor.start(startRequest);
    await waitForStatus(running.id, 'running');
    executor.cancel(queued.id);
    expect(executor.get(queued.id)).toMatchObject({ status: 'cancelled', cancelReason: 'user' });
    expect(existsSync(runLogFile(paths, queued.id))).toBe(false);
    executor.cancel(running.id);
    await waitForStatus(running.id, 'cancelled');
    expect(executor.get(running.id).cancelReason).toBe('user');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(readLogText(running.id)).toContain('Cancelled by user at step 1');
  });

  it('AC-5: with limit 1 the second run stays queued until the first finishes', async () => {
    setup(makeDefinition([sleepStep('long', 150)]));
    const first: PipelineRun = executor.start(startRequest);
    const second: PipelineRun = executor.start(startRequest);
    await waitForStatus(first.id, 'running');
    expect(executor.get(second.id).status).toBe('queued');
    await waitForStatus(first.id, 'succeeded');
    await waitForStatus(second.id, 'succeeded');
  });

  it('REQ-009 AC-2: raising the limit starts queued runs at once while the first is still running', async () => {
    const releases: Array<() => void> = [];
    setup(makeDefinition([gatedStep('gated', releases)]));
    const runs: PipelineRun[] = [
      executor.start(startRequest),
      executor.start(startRequest),
      executor.start(startRequest),
    ];
    await waitForStatus(runs[0].id, 'running');
    expect(executor.get(runs[1].id).status).toBe('queued');
    expect(executor.get(runs[2].id).status).toBe('queued');
    limit = 3;
    executor.limitChanged();
    for (const run of runs) {
      await waitForStatus(run.id, 'running');
    }
    releases.forEach((release) => release());
    for (const run of runs) {
      await waitForStatus(run.id, 'succeeded');
    }
  });

  it('REQ-009 AC-3: lowering the limit keeps running runs and holds new runs until the active count drops', async () => {
    const releases: Array<() => void> = [];
    limit = 3;
    setup(makeDefinition([gatedStep('gated', releases)]));
    const runs: PipelineRun[] = [
      executor.start(startRequest),
      executor.start(startRequest),
      executor.start(startRequest),
    ];
    for (const run of runs) {
      await waitForStatus(run.id, 'running');
    }
    limit = 1;
    executor.limitChanged();
    const fourth: PipelineRun = executor.start(startRequest);
    for (const run of runs) {
      expect(executor.get(run.id).status).toBe('running');
    }
    expect(executor.get(fourth.id).status).toBe('queued');
    for (let finished = 0; finished < runs.length; finished++) {
      releases[finished]();
      await waitForStatus(runs[finished].id, 'succeeded');
      if (finished < runs.length - 1) {
        expect(executor.get(fourth.id).status).toBe('queued');
      }
    }
    await waitForStatus(fourth.id, 'running');
    releases[3]();
    await waitForStatus(fourth.id, 'succeeded');
  });

  it('fail: a step throwing a CodedError stores the code, message and stack, unknown type is rejected', async () => {
    setup(
      makeDefinition([
        {
          key: 'broken',
          backend: false,
          run: (): Promise<void> => Promise.reject(new CodedError(ErrorCode.DbQueryFailed, 'step exploded')),
        },
      ]),
    );
    const run: PipelineRun = executor.start(startRequest);
    await waitForStatus(run.id, 'failed');
    expect(executor.get(run.id)).toMatchObject({ errorCode: ErrorCode.DbQueryFailed, error: 'step exploded' });
    expect(cleanup).toHaveBeenCalledTimes(1);
    await vi.waitFor((): void => expect(readLogText(run.id)).toContain('CodedError'), { timeout: 3000 });
    expect(() => executor.start({ type: 'other' as 'demo', failAtStep: null })).toThrow(CodedError);
    try {
      executor.start({ type: 'other' as 'demo', failAtStep: null });
    } catch (error) {
      expect((error as CodedError).code).toBe(ErrorCode.PipelineUnknownType);
    }
  });

  it('keeps a run failed when failure cleanup also throws', async () => {
    cleanup.mockRejectedValueOnce(new Error('cleanup exploded'));
    setup(
      makeDefinition([
        {
          key: 'broken',
          backend: false,
          run: (): Promise<void> => Promise.reject(new Error('step exploded')),
        },
      ]),
    );
    const run: PipelineRun = executor.start(startRequest);
    await waitForStatus(run.id, 'failed');
    expect(executor.get(run.id)).toMatchObject({ status: 'failed', error: 'step exploded' });
    await vi.waitFor((): void => expect(readLogText(run.id)).toContain('Cleanup failed'), { timeout: 3000 });
  });

  it('AC-6: recover cancels queued and running rows with reason appClosed', () => {
    repository.insert(makeRun('r1', 'running'), {});
    repository.insert(makeRun('q1', 'queued'), {});
    repository.insert(makeRun('s1', 'succeeded'), {});
    expect(executor.recover().sort()).toEqual(['q1', 'r1']);
    for (const id of ['r1', 'q1']) {
      expect(executor.get(id)).toMatchObject({ status: 'cancelled', cancelReason: 'appClosed' });
    }
    expect(executor.get('s1').status).toBe('succeeded');
    expect(executor.list(allRuns).total).toBe(3);
  });

  it('AC-7: cancelAll cancels running and queued runs at once and logs the app close', async () => {
    setup(makeDefinition([sleepStep('long', 2000)]));
    const running: PipelineRun = executor.start(startRequest);
    const queued: PipelineRun = executor.start(startRequest);
    await waitForStatus(running.id, 'running');
    executor.cancelAll('appClosed');
    for (const id of [running.id, queued.id]) {
      expect(executor.get(id)).toMatchObject({ status: 'cancelled', cancelReason: 'appClosed' });
    }
    expect(executor.hasActive()).toBe(false);
    expect(readLogText(running.id)).toContain('Cancelled: app closed');
  });

  it('AC-8: the log survives success and delete removes the row and file but skips active runs', async () => {
    const done: PipelineRun = executor.start(startRequest);
    await waitForStatus(done.id, 'succeeded');
    expect(existsSync(runLogFile(paths, done.id))).toBe(true);
    setup(makeDefinition([sleepStep('long', 2000)]));
    const active: PipelineRun = executor.start(startRequest);
    expect(executor.delete([active.id])).toEqual([]);
    expect(executor.get(active.id).status).not.toBe('succeeded');
    expect(executor.delete([done.id])).toEqual([done.id]);
    expect(repository.get(done.id)).toBeNull();
    expect(existsSync(runLogFile(paths, done.id))).toBe(false);
  });
});
