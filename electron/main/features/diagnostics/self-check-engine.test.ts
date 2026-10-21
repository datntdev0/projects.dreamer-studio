import { describe, expect, it, vi } from 'vitest';
import { CheckResult, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { CheckContext, SelfCheck } from './self-check';
import { SelfCheckEngine } from './self-check-engine';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const context = (): CheckContext => ({}) as CheckContext;

function fakeCheck(id: string, run: SelfCheck['run']): SelfCheck {
  return { id, category: 'storage', nameKey: `${id}.name`, run };
}

const okCheck = (id: string): SelfCheck =>
  fakeCheck(id, () => Promise.resolve({ status: 'ok', messageKey: `${id}.ok`, fixKey: null }));
const throwingCheck: SelfCheck = fakeCheck('throws', () => Promise.reject(new Error('boom')));
const hangingCheck: SelfCheck = fakeCheck('hangs', () => new Promise(() => undefined));

function byId(run: DiagnosticsRun, id: string): CheckResult {
  return run.results.find((result: CheckResult): boolean => result.id === id) as CheckResult;
}

describe('SelfCheckEngine', () => {
  it('turns a throwing and a hanging check into errors while the others still return, in registration order', async () => {
    const engine: SelfCheckEngine = new SelfCheckEngine(context, 50);
    [okCheck('first'), throwingCheck, hangingCheck, okCheck('last')].forEach((check: SelfCheck): void =>
      engine.register(check),
    );

    const run: DiagnosticsRun = await engine.run();

    expect(run.results.map((result: CheckResult): string => result.id)).toEqual(['first', 'throws', 'hangs', 'last']);
    expect(byId(run, 'first').status).toBe('ok');
    expect(byId(run, 'last')).toMatchObject({ status: 'ok', nameKey: 'last.name', messageKey: 'last.ok' });
    expect(byId(run, 'throws')).toMatchObject({
      status: 'error',
      messageKey: 'diagnostics.check.failed',
      fixKey: 'diagnostics.check.failedFix',
    });
    expect(byId(run, 'hangs')).toMatchObject({
      status: 'error',
      messageKey: 'diagnostics.check.timeout',
      fixKey: 'diagnostics.check.failedFix',
    });
  });

  it('throws when a check id is registered twice', () => {
    const engine: SelfCheckEngine = new SelfCheckEngine(context);
    engine.register(okCheck('same'));

    expect(() => engine.register(okCheck('same'))).toThrow();
  });

  it('returns the same promise for a run called while another is running', async () => {
    const engine: SelfCheckEngine = new SelfCheckEngine(context);
    engine.register(okCheck('only'));

    const first: Promise<DiagnosticsRun> = engine.run();
    const second: Promise<DiagnosticsRun> = engine.run();

    expect(second).toBe(first);
    await first;
  });

  it('rejects the run when the context cannot be built', async () => {
    const engine: SelfCheckEngine = new SelfCheckEngine((): CheckContext => {
      throw new Error('switching');
    });
    engine.register(okCheck('only'));

    await expect(engine.run()).rejects.toThrow();
  });
});
