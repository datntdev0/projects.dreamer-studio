import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendState } from '@dreamer/shared/ipc/backend';
import { CheckOutcome, CheckResult, CheckStatus, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { checkDatabase, Database } from '../../storage/database';
import { AppPaths, resolveAppPaths } from '../../storage/paths';
import { SettingsLoadResult } from '../settings/settings-store';
import { registerBuiltInChecks } from './built-in-checks';
import { CheckContext } from './self-check';
import { SelfCheckEngine } from './self-check-engine';

const folderProbe = vi.hoisted(() => ({ free: 0 as number | null }));

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../storage/folder-probe', async (importActual) => ({
  ...(await importActual<typeof import('../../storage/folder-probe')>()),
  freeBytes: (): number | null => folderProbe.free,
}));

const checkIds: string[] = [
  'storage.appData',
  'storage.settingsDir',
  'storage.diskSpace',
  'database.integrity',
  'backend.reachable',
  'settings.file',
];
const megabyte: number = 1024 * 1024;
const gigabyte: number = 1024 * megabyte;

let tempDir: string;
let context: CheckContext;
let db: Database;
let engine: SelfCheckEngine;
const seenKeys: Set<string> = new Set();

function collectKeys(run: DiagnosticsRun): void {
  run.results.forEach((result: CheckResult): void => {
    [result.nameKey, result.messageKey, result.fixKey].forEach((key: string | null): void => {
      if (key) {
        seenKeys.add(key);
      }
    });
  });
}

async function runChecks(overrides: Partial<CheckContext> = {}): Promise<Map<string, CheckResult>> {
  context = { ...context, ...overrides };
  const run: DiagnosticsRun = await engine.run();
  collectKeys(run);
  return new Map(run.results.map((result: CheckResult): [string, CheckResult] => [result.id, result]));
}

function backend(state: BackendState, ping: boolean): Partial<CheckContext> {
  return { backend: state, pingBackend: (): Promise<boolean> => Promise.resolve(ping) };
}

function settings(value: SettingsLoadResult): Partial<CheckContext> {
  return { settings: value };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-built-in-checks-'));
  const paths: AppPaths = { ...resolveAppPaths(tempDir), settingsFile: join(tempDir, 'settings.json') };
  db = Database.open(paths.database);
  context = {
    paths,
    checkDatabase: (): CheckOutcome => checkDatabase(db),
    settings: { notice: 'none', invalid: [] },
    backend: 'running',
    pingBackend: (): Promise<boolean> => Promise.resolve(true),
  };
  folderProbe.free = 10 * gigabyte;
  engine = new SelfCheckEngine((): CheckContext => context);
  registerBuiltInChecks(engine);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('built-in checks', () => {
  it('reports ok for every check in a healthy setup and leaves no probe file behind', async () => {
    const results: Map<string, CheckResult> = await runChecks();

    expect([...results.keys()]).toEqual(checkIds);
    checkIds.forEach((id: string): void => {
      expect(results.get(id)).toMatchObject({
        status: 'ok',
        nameKey: `diagnostics.check.${id}.name`,
        messageKey: `diagnostics.check.${id}.ok`,
        fixKey: null,
      });
    });
    expect(readdirSync(tempDir)).not.toContain('.dreamer-write-test');
  });

  it('reports a storage error when the app data folder does not exist', async () => {
    const missing: string = join(tempDir, 'missing');

    const results: Map<string, CheckResult> = await runChecks({ paths: { ...context.paths, root: missing } });

    expect(results.get('storage.appData')).toMatchObject({
      status: 'error',
      messageKey: 'diagnostics.check.storage.appData.error',
      fixKey: 'diagnostics.check.storage.appData.fix',
    });
    expect(existsSync(missing)).toBe(false);
  });

  it.each<[string, number | null, CheckStatus, string, string | null]>([
    ['more than 1 GB', 2 * gigabyte, 'ok', 'ok', null],
    ['less than 1 GB', 500 * megabyte, 'warning', 'warning', 'fix'],
    ['less than 100 MB', 50 * megabyte, 'error', 'error', 'fix'],
    ['unknown', null, 'warning', 'unknown', 'unknownFix'],
  ])('reports disk space %s', async (_name, free, status, messageSuffix, fixSuffix) => {
    folderProbe.free = free;

    const result: CheckResult = (await runChecks()).get('storage.diskSpace') as CheckResult;

    expect(result.status).toBe(status);
    expect(result.messageKey).toBe(`diagnostics.check.storage.diskSpace.${messageSuffix}`);
    expect(result.fixKey).toBe(fixSuffix ? `diagnostics.check.storage.diskSpace.${fixSuffix}` : null);
    expect(result.params).toHaveProperty('drive');
    if (free !== null) {
      expect(result.params.free).toBe(free);
    }
  });

  it('reports the backend as warning while starting and error when it does not answer', async () => {
    const starting: CheckResult = (await runChecks(backend('starting', false))).get('backend.reachable') as CheckResult;
    const silent: CheckResult = (await runChecks(backend('running', false))).get('backend.reachable') as CheckResult;

    expect(starting).toMatchObject({ status: 'warning', messageKey: 'diagnostics.check.backend.reachable.warning' });
    expect(starting.fixKey).toBe('diagnostics.check.backend.reachable.warningFix');
    expect(silent).toMatchObject({
      status: 'error',
      messageKey: 'diagnostics.check.backend.reachable.error',
      fixKey: 'diagnostics.check.backend.reachable.fix',
    });
  });

  it('reports settings problems as warning for invalid fields and error when unreadable', async () => {
    const invalid: CheckResult = (
      await runChecks(settings({ notice: 'invalidFields', invalid: ['theme', 'language'] }))
    ).get('settings.file') as CheckResult;
    const unreadable: CheckResult = (await runChecks(settings({ notice: 'unreadable', invalid: [] }))).get(
      'settings.file',
    ) as CheckResult;

    expect(invalid).toMatchObject({ status: 'warning', messageKey: 'diagnostics.check.settings.file.warning' });
    expect(String(invalid.params.fields)).toContain('theme');
    expect(String(invalid.params.fields)).toContain('language');
    expect(unreadable).toMatchObject({ status: 'error', messageKey: 'diagnostics.check.settings.file.error' });
  });

  it('only returns keys that exist in the English and Vietnamese catalogs', async () => {
    await runChecks();
    folderProbe.free = 50 * megabyte;
    await runChecks({ paths: { ...context.paths, root: join(tempDir, 'missing') } });
    folderProbe.free = 500 * megabyte;
    await runChecks(backend('starting', false));
    folderProbe.free = null;
    await runChecks(backend('running', false));
    await runChecks(settings({ notice: 'invalidFields', invalid: ['theme'] }));
    await runChecks(settings({ notice: 'unreadable', invalid: [] }));
    const catalogs: Record<string, string>[] = ['en', 'vi'].map((language: string): Record<string, string> =>
      JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'shared', 'i18n', `${language}.json`), 'utf-8')),
    );

    expect(seenKeys.size).toBeGreaterThan(checkIds.length);
    seenKeys.forEach((key: string): void => {
      catalogs.forEach((catalog: Record<string, string>): void => {
        expect(Object.keys(catalog), key).toContain(key);
      });
    });
  });
});
