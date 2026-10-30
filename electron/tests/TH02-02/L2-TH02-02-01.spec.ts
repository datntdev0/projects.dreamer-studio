import { workspace } from '../support/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltInChecks } from '../../main/features/diagnostics/built-in-checks';
import { SelfCheckEngine } from '../../main/features/diagnostics/self-check-engine';
import type { CheckContext } from '../../main/features/diagnostics/self-check';
import type { CheckOutcome } from '@dreamer/shared/models/diagnostics';

describe('[TH02-02] L2-TH02-02-01 independent, stateless diagnostics', () => {
  let work: ReturnType<typeof workspace>;
  let context: CheckContext;
  beforeEach(() => {
    work = workspace();
    context = {
      paths: { ...work.paths, settingsFile: `${work.root}/settings.json` },
      checkDatabase: () => ({ status: 'ok', messageKey: 'database.ok', fixKey: null }),
      settings: { notice: 'none', invalid: [] },
      backend: 'running',
      pingBackend: async () => true,
      llmStatus: async () => [],
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    work.dispose();
  });

  it('AC2/4 reports OK/Warning/Error and re-evaluates changed health on rerun', async () => {
    context.settings = { notice: 'invalidFields', invalid: ['language'] };
    context.backend = 'unavailable';
    const engine = new SelfCheckEngine(() => context);
    registerBuiltInChecks(engine);
    const first = await engine.run();
    expect(first.results.find((result) => result.id === 'database.integrity')).toMatchObject({
      status: 'ok',
      fixKey: null,
    });
    expect(first.results.find((result) => result.id === 'settings.file')).toMatchObject({
      status: 'warning',
      fixKey: expect.any(String),
      params: { fields: 'language' },
    });
    expect(first.results.find((result) => result.id === 'backend.reachable')).toMatchObject({
      status: 'error',
      fixKey: expect.any(String),
    });
    context.settings = { notice: 'none', invalid: [] };
    context.backend = 'running';
    const second = await engine.run();
    expect(second).not.toBe(first);
    expect(second.results.find((result) => result.id === 'settings.file')?.status).toBe('ok');
    expect(second.results.find((result) => result.id === 'backend.reachable')?.status).toBe('ok');
    expect(first.results.find((result) => result.id === 'backend.reachable')?.status).toBe('error');
    expect(second.results).toHaveLength(first.results.length);
  });

  it('AC3 isolates a throwing database check and a timed-out worker while other checks finish', async () => {
    vi.useFakeTimers();
    context.checkDatabase = () => {
      throw new Error('Database unavailable');
    };
    const engine = new SelfCheckEngine(() => context, 100);
    registerBuiltInChecks(engine);
    engine.register({
      id: 'slow',
      category: 'llm',
      nameKey: 'slow.name',
      run: () => new Promise<CheckOutcome>(() => undefined),
    });
    const pending = engine.run();
    await vi.advanceTimersByTimeAsync(100);
    const run = await pending;
    expect(run.results.find((result) => result.id === 'database.integrity')).toMatchObject({
      status: 'error',
      messageKey: 'diagnostics.check.failed',
    });
    expect(run.results.find((result) => result.id === 'slow')).toMatchObject({
      status: 'error',
      messageKey: 'diagnostics.check.timeout',
      fixKey: expect.any(String),
    });
    expect(run.results.find((result) => result.id === 'settings.file')?.status).toBe('ok');
    expect(run.results.find((result) => result.id === 'backend.reachable')?.status).toBe('ok');
  });
});
