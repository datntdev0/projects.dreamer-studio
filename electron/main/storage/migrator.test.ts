import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { Database } from './database';
import { loadMigrations, Migration, runMigrations } from './migrator';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

interface HistoryRow {
  id: string;
  version: string;
  upgrade_num: number;
  applied_at: string;
}

const historyId: string = '0.0.0_0__sys_migration_history_table';
const historyFile: string = `${historyId}.sql`;
const realMigrationsDir: string = join(__dirname, 'migrations');

let tempDir: string;
let migrationsDir: string;
let databaseFile: string;
let backupFile: string;
let db: Database | null;

function writeMigration(name: string, sql: string): void {
  writeFileSync(join(migrationsDir, name), sql);
}

function openDb(): Database {
  db = Database.open(databaseFile);
  return db;
}

function historyIds(database: Database): string[] {
  return database
    .all<HistoryRow>('SELECT * FROM sys_migration_history ORDER BY rowid')
    .map((row: HistoryRow) => row.id);
}

function captureError(action: () => unknown): CodedError {
  try {
    action();
  } catch (error) {
    return error as CodedError;
  }
  throw new Error('expected an error');
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-migrator-'));
  migrationsDir = join(tempDir, 'migrations');
  mkdirSync(migrationsDir);
  databaseFile = join(tempDir, 'database.sqlite');
  backupFile = join(tempDir, 'database.backup.sqlite');
  db = null;
});

afterEach(() => {
  db?.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('[TH01-02] loadMigrations', () => {
  it('sorts by version numbers then upgrade number', () => {
    writeMigration('0.10.0_1__c.sql', 'SELECT 1');
    writeMigration('0.10.0_0__b.sql', 'SELECT 1');
    writeMigration('0.9.0_2__a.sql', 'SELECT 1');
    const migrations: Migration[] = loadMigrations(migrationsDir);
    expect(migrations.map((migration: Migration) => migration.id)).toEqual([
      '0.9.0_2__a',
      '0.10.0_0__b',
      '0.10.0_1__c',
    ]);
    expect(migrations[0]).toEqual({ id: '0.9.0_2__a', version: '0.9.0', upgradeNum: 2, sql: 'SELECT 1' });
  });

  it('ignores files that are not sql', () => {
    writeMigration('0.1.0_0__a.sql', 'SELECT 1');
    writeMigration('notes.txt', 'hello');
    writeMigration('README.md', 'hello');
    expect(loadMigrations(migrationsDir)).toHaveLength(1);
  });

  it('rejects a bad sql file name', () => {
    writeMigration('0.1.0__a.sql', 'SELECT 1');
    const error: CodedError = captureError(() => loadMigrations(migrationsDir));
    expect(error.code).toBe(ErrorCode.DbMigrationFailed);
  });

  it('rejects a duplicate version and upgrade number', () => {
    writeMigration('0.1.0_0__a.sql', 'SELECT 1');
    writeMigration('0.1.0_0__b.sql', 'SELECT 1');
    const error: CodedError = captureError(() => loadMigrations(migrationsDir));
    expect(error.code).toBe(ErrorCode.DbMigrationFailed);
  });

  it('rejects a missing folder', () => {
    const error: CodedError = captureError(() => loadMigrations(join(tempDir, 'missing')));
    expect(error.code).toBe(ErrorCode.DbMigrationFailed);
  });
});

describe('[TH01-02] runMigrations', () => {
  beforeEach(() => {
    writeFileSync(join(migrationsDir, historyFile), readFileSync(join(realMigrationsDir, historyFile)));
  });

  it('records the history table migration itself on a fresh database', () => {
    const database: Database = openDb();
    const result: { applied: string[] } = runMigrations(database, loadMigrations(migrationsDir), backupFile);
    expect(result.applied).toEqual([historyId]);
    expect(historyIds(database)).toEqual([historyId]);
    expect(existsSync(backupFile)).toBe(false);
  });

  it('applies pending files in order and records rows in order', () => {
    writeMigration('0.1.0_0__c.sql', 'CREATE TABLE c(x INTEGER)');
    writeMigration('0.0.0_2__b.sql', 'CREATE TABLE b(x INTEGER)');
    writeMigration('0.0.0_1__a.sql', 'CREATE TABLE a(x INTEGER)');
    const database: Database = openDb();
    const result: { applied: string[] } = runMigrations(database, loadMigrations(migrationsDir), backupFile);
    const expected: string[] = [historyId, '0.0.0_1__a', '0.0.0_2__b', '0.1.0_0__c'];
    expect(result.applied).toEqual(expected);
    expect(historyIds(database)).toEqual(expected);
    expect(existsSync(backupFile)).toBe(false);
  });

  it('skips applied files on the second run', () => {
    const database: Database = openDb();
    runMigrations(database, loadMigrations(migrationsDir), backupFile);
    const result: { applied: string[] } = runMigrations(database, loadMigrations(migrationsDir), backupFile);
    expect(result.applied).toEqual([]);
    expect(historyIds(database)).toEqual([historyId]);
    expect(existsSync(backupFile)).toBe(false);
  });

  it('makes a backup when files are pending and rows exist', () => {
    const database: Database = openDb();
    runMigrations(database, loadMigrations(migrationsDir), backupFile);
    writeMigration('0.0.0_1__a.sql', 'CREATE TABLE a(x INTEGER)');
    const result: { applied: string[] } = runMigrations(database, loadMigrations(migrationsDir), backupFile);
    expect(result.applied).toEqual(['0.0.0_1__a']);
    expect(existsSync(backupFile)).toBe(true);
  });

  it('stops at a failing file and keeps earlier rows', () => {
    writeMigration('0.0.0_1__a.sql', 'CREATE TABLE a(x INTEGER)');
    writeMigration('0.0.0_2__bad.sql', 'THIS IS NOT SQL');
    writeMigration('0.0.0_3__c.sql', 'CREATE TABLE c(x INTEGER)');
    const database: Database = openDb();
    const error: CodedError = captureError(() => runMigrations(database, loadMigrations(migrationsDir), backupFile));
    expect(error.code).toBe(ErrorCode.DbMigrationFailed);
    expect(error.message).toContain('0.0.0_2__bad');
    expect(historyIds(database)).toEqual([historyId, '0.0.0_1__a']);
  });

  it('rejects a database with an unknown applied id and writes nothing', () => {
    const database: Database = openDb();
    runMigrations(database, loadMigrations(migrationsDir), backupFile);
    database.run('INSERT INTO sys_migration_history(id, version, upgrade_num, applied_at) VALUES (?, ?, ?, ?)', [
      '999.0.0_0__x',
      '999.0.0',
      0,
      new Date().toISOString(),
    ]);
    writeMigration('0.0.0_1__a.sql', 'CREATE TABLE a(x INTEGER)');
    const error: CodedError = captureError(() => runMigrations(database, loadMigrations(migrationsDir), backupFile));
    expect(error.code).toBe(ErrorCode.DbNewerVersion);
    expect(historyIds(database)).toEqual([historyId, '999.0.0_0__x']);
    expect(database.get('SELECT name FROM sqlite_master WHERE name = ?', ['a'])).toBeUndefined();
    expect(existsSync(backupFile)).toBe(false);
  });
});
