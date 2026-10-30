import { sessionDeps, workspace } from '../support/fixtures';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDataSession } from '../../main/app/app-data-session';
import { abortError, type StepContext } from '../../main/features/pipelines/pipeline-definition';
import { runLogFile } from '../../main/features/pipelines/run-log';

describe('[TH01-04] L2-TH01-04-01 persisted pipeline lifecycle', () => {
  let work: ReturnType<typeof workspace>;
  let session: AppDataSession;
  let limit: number;
  let releases: Array<() => void>;
  let cleanup: ReturnType<typeof vi.fn<(ctx: StepContext) => Promise<void>>>;
  beforeEach(() => {
    work = workspace();
    limit = 1;
    releases = [];
    cleanup = vi.fn(async () => undefined);
    session = AppDataSession.open(work.root, {
      ...sessionDeps([
        {
          type: 'demo',
          cleanup,
          steps: [
            {
              key: 'work',
              backend: false,
              run: async (ctx: StepContext) => {
                ctx.progress(50);
                ctx.log.info('acceptance checkpoint');
                await new Promise<void>((resolve, reject) => {
                  const abort = () => reject(abortError());
                  ctx.signal.addEventListener('abort', abort, { once: true });
                  releases.push(() => {
                    ctx.signal.removeEventListener('abort', abort);
                    resolve();
                  });
                });
                ctx.checkpoint();
              },
            },
          ],
        },
      ]),
      limit: () => limit,
    });
  });
  afterEach(async () => {
    session.executor.cancelAll('appClosed');
    releases.forEach((release) => release());
    await new Promise<void>((resolve) => setImmediate(resolve));
    session.close();
    work.dispose();
  });
  const query = { finished: null, statuses: [], types: [], limit: 50, after: null } as const;

  it('AC1/2/5 starts only available slots, persists progress and deletes logs with finished history', async () => {
    const first = session.executor.startRun('demo', {}, 'Acceptance run');
    const second = session.executor.startRun('demo', {}, 'Acceptance run');
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    await vi.waitFor(() =>
      expect(session.executor.get(first.id)).toMatchObject({ status: 'running', progress: 50, stepName: 'work' }),
    );
    expect(session.executor.get(second.id).status).toBe('queued');
    expect(session.executor.delete([first.id])).toEqual([]);
    releases[0]();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]();
    await vi.waitFor(() => expect(session.executor.get(second.id).status).toBe('succeeded'));
    expect(session.executor.get(first.id)).toMatchObject({
      status: 'succeeded',
      progress: 100,
      finishedAt: expect.any(String),
    });
    const log = runLogFile(work.paths, first.id);
    expect(readFileSync(log, 'utf8')).toContain('acceptance checkpoint');
    expect(session.executor.list({ ...query, statuses: [], types: [] }).total).toBe(2);
    expect(session.executor.delete([first.id])).toEqual([first.id]);
    expect(existsSync(log)).toBe(false);
    expect(existsSync(runLogFile(work.paths, second.id))).toBe(true);
  });

  it('AC3 cancels queued work before execution and running work at a checkpoint with cleanup', async () => {
    const running = session.executor.startRun('demo', {}, 'Acceptance run');
    const queued = session.executor.startRun('demo', {}, 'Acceptance run');
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    session.executor.cancel(queued.id);
    session.executor.cancel(running.id);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
    for (const run of [running, queued])
      expect(session.executor.get(run.id)).toMatchObject({ status: 'cancelled', cancelReason: 'user' });
    expect(releases).toHaveLength(1);
    expect(existsSync(runLogFile(work.paths, queued.id))).toBe(false);
  });

  it('AC4 recovers persisted active runs as cancelled after reopening storage', () => {
    // Seed the on-disk state of a previous process, without leaving live workers behind.
    for (const status of ['running', 'queued', 'succeeded']) {
      session.db.run('INSERT INTO pipeline_run (id,type,status,step_count,created_at) VALUES (?,?,?,?,?)', [
        status,
        'demo',
        status,
        1,
        '2026-01-01T00:00:00Z',
      ]);
    }
    session.close();
    session = AppDataSession.open(work.root, sessionDeps());
    for (const id of ['running', 'queued'])
      expect(session.executor.get(id)).toMatchObject({ status: 'cancelled', cancelReason: 'appClosed' });
    expect(session.executor.get('succeeded').status).toBe('succeeded');
    expect(session.executor.hasActive()).toBe(false);
  });

  it('[L2-TH02-01-01] AC6 uses changed concurrency for queued work without stopping running work', async () => {
    const runs = Array.from({ length: 3 }, () => session.executor.startRun('demo', {}, 'Acceptance run'));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    limit = 2;
    session.executor.limitChanged();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    limit = 1;
    session.executor.limitChanged();
    expect(runs.slice(0, 2).map((run) => session.executor.get(run.id).status)).toEqual(['running', 'running']);
    releases[0]();
    await vi.waitFor(() => expect(session.executor.get(runs[0].id).status).toBe('succeeded'));
    expect(session.executor.get(runs[2].id).status).toBe('queued');
    releases[1]();
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[2]();
    await vi.waitFor(() => expect(session.executor.get(runs[2].id).status).toBe('succeeded'));
  });
});
