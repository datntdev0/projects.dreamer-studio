import { sessionDeps, workspace } from '../support/fixtures';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppDataManager, type AppDataManagerDeps } from '../../main/app/app-data-manager';
import { AppDataSession } from '../../main/app/app-data-session';
import { SettingsStore } from '../../main/features/settings/settings-store';

describe('[TH02-01] L2-TH02-01-01 settings and atomic folder switch', () => {
  let work: ReturnType<typeof workspace>;
  let manager: AppDataManager;
  let settings: SettingsStore;
  let deps: AppDataManagerDeps;
  beforeEach(() => {
    work = workspace();
    settings = new SettingsStore(join(work.root, 'fixed-settings.json'), work.root);
    settings.load();
    deps = {
      ...sessionDeps(),
      startBackend: vi.fn(async () => undefined),
      stopBackend: vi.fn(),
      onReopenFailed: vi.fn(),
    };
    manager = new AppDataManager(settings, deps);
    manager.open(work.root);
  });
  afterEach(() => {
    manager.close();
    work.dispose();
  });

  it('AC1 saves valid preferences across a new settings instance and refuses invalid patches', () => {
    settings.update({ theme: 'dark', language: 'vi', pipelines: { maxConcurrent: 3 } });
    expect(() => settings.update({ pipelines: { maxConcurrent: 0 } })).toThrow(
      expect.objectContaining({ code: ErrorCode.SettingsInvalid }),
    );
    const reopened = new SettingsStore(join(work.root, 'fixed-settings.json'), work.root);
    reopened.load();
    expect(reopened.get()).toMatchObject({ theme: 'dark', language: 'vi', pipelines: { maxConcurrent: 3 } });
  });

  it.each(['empty', 'existing'] as const)(
    'AC2/3 opens a writable %s folder and preserves the previous database',
    async (kind) => {
      manager.session().db.exec("CREATE TABLE old_data (value TEXT); INSERT INTO old_data VALUES ('old')");
      const target = join(work.root, 'target');
      mkdirSync(target);
      if (kind === 'existing') {
        const existing = AppDataSession.open(target, deps);
        existing.db.exec("CREATE TABLE target_data (value TEXT); INSERT INTO target_data VALUES ('target')");
        existing.close();
      }
      const steps: string[] = [];
      await manager.switchTo(target, (step) => steps.push(step));
      expect(manager.session().paths.root).toBe(target);
      expect(settings.get().appDataDir).toBe(target);
      expect(deps.startBackend).toHaveBeenCalledWith(manager.paths());
      expect(steps).toEqual(['close', 'folders', 'database', 'backend']);
      if (kind === 'existing')
        expect(manager.session().db.all('SELECT value FROM target_data')).toEqual([{ value: 'target' }]);
      const old = AppDataSession.open(work.root, deps);
      try {
        expect(old.db.all('SELECT value FROM old_data')).toEqual([{ value: 'old' }]);
      } finally {
        old.close();
      }
    },
  );

  it('AC4 keeps the old session for a missing target and reopens it after a failed upgrade', async () => {
    await expect(manager.switchTo(join(work.root, 'missing'), vi.fn())).rejects.toMatchObject({
      code: ErrorCode.AppDataUnwritable,
    });
    const target = join(work.root, 'target');
    mkdirSync(target);
    const original = deps.migrations;
    deps.migrations = () => [
      ...original(),
      { id: '999.0.0_0__fail', version: '999.0.0', upgradeNum: 0, sql: 'INVALID SQL' },
    ];
    // Only the target upgrade fails; reopening the previous folder uses the original catalog.
    let first = true;
    const failing = deps.migrations;
    deps.migrations = () => {
      if (first) {
        first = false;
        return failing();
      }
      return original();
    };
    const steps: string[] = [];
    await expect(manager.switchTo(target, (step) => steps.push(step))).rejects.toMatchObject({
      code: ErrorCode.DbMigrationFailed,
    });
    expect(steps).toContain('rollback');
    expect(manager.session().paths.root).toBe(work.root);
    expect(settings.get().appDataDir).toBe(work.root);
    expect(manager.session().db.get('SELECT 1 AS ready')).toEqual({ ready: 1 });
  });

  it('AC5 blocks switching while a queued pipeline exists', async () => {
    vi.spyOn(manager.session().executor, 'hasActive').mockReturnValue(true);
    await expect(manager.switchTo(work.root, vi.fn())).rejects.toMatchObject({
      code: ErrorCode.AppDataPipelinesActive,
    });
    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(manager.session().paths.root).toBe(work.root);
  });
});
