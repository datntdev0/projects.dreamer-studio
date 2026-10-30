import { sessionDeps, workspace } from '../support/fixtures';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { Database } from '@storage/database';
import { runMigrations } from '@storage/migrator';
import { AppDataSession } from '../../main/app/app-data-session';

describe('[TH01-02] L2-TH01-02-01 startup storage contract', () => {
  let work: ReturnType<typeof workspace>;
  let session: AppDataSession | undefined;
  beforeEach(() => {
    work = workspace();
  });
  afterEach(() => {
    session?.close();
    session = undefined;
    work.dispose();
  });

  it('AC1 initializes standard folders and operational database on first startup', () => {
    session = AppDataSession.open(work.root, sessionDeps());
    for (const path of [session.paths.database, session.paths.library, session.paths.logs, session.paths.cache])
      expect(existsSync(path)).toBe(true);
    expect(session.db.all('SELECT * FROM pipeline_run')).toEqual([]);
  });

  it('AC2/3 upgrades populated storage once and backs up data before applying pending migrations', () => {
    const deps = sessionDeps();
    const migrations = deps.migrations();
    const old = Database.open(work.paths.database);
    runMigrations(old, migrations.slice(0, 1), work.paths.databaseBackup);
    old.exec("CREATE TABLE acceptance_data (value TEXT); INSERT INTO acceptance_data VALUES ('preserved')");
    old.close();
    session = AppDataSession.open(work.root, deps);
    expect(session.db.all('SELECT value FROM acceptance_data')).toEqual([{ value: 'preserved' }]);
    const backup = Database.open(session.paths.databaseBackup);
    try {
      expect(backup.all('SELECT value FROM acceptance_data')).toEqual([{ value: 'preserved' }]);
      expect(backup.all('SELECT id FROM sys_migration_history')).toHaveLength(1);
    } finally {
      backup.close();
    }
    const history = session.db.all('SELECT id FROM sys_migration_history ORDER BY rowid');
    expect(history).toEqual(migrations.map(({ id }) => ({ id })));
    session.close();
    session = AppDataSession.open(work.root, deps);
    expect(session.db.all('SELECT id FROM sys_migration_history ORDER BY rowid')).toEqual(history);
  });

  it.each(['failed', 'unknown'] as const)(
    'AC4 blocks startup with %s migration and keeps prior data readable',
    (kind) => {
      const deps = sessionDeps();
      session = AppDataSession.open(work.root, deps);
      session.db.exec("CREATE TABLE acceptance_data (value TEXT); INSERT INTO acceptance_data VALUES ('original')");
      if (kind === 'unknown')
        session.db.run("INSERT INTO sys_migration_history VALUES ('future', '999.0.0', 0, 'now')");
      session.close();
      session = undefined;
      const migrations = deps.migrations();
      if (kind === 'failed')
        migrations.push({ id: '999.0.0_0__fail', version: '999.0.0', upgradeNum: 0, sql: 'INVALID SQL' });
      expect(() => AppDataSession.open(work.root, { ...deps, migrations: () => migrations })).toThrow(
        expect.objectContaining({ code: kind === 'failed' ? ErrorCode.DbMigrationFailed : ErrorCode.DbNewerVersion }),
      );
      const db = Database.open(work.paths.database);
      try {
        expect(db.all('SELECT value FROM acceptance_data')).toEqual([{ value: 'original' }]);
      } finally {
        db.close();
      }
    },
  );
});
