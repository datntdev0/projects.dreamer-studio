import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { AppDataCandidate, AppDataContent } from '@dreamer/shared/models/app-data';
import { t } from '../app/app-i18n';
import { createLogger, Logger } from '../logging/logger';
import { Database } from './database';

export interface Migration {
  id: string;
  version: string;
  upgradeNum: number;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
}

interface Versioned {
  version: string;
  upgradeNum: number;
}

export interface HistoryRow extends Versioned {
  id: string;
}

export type AppDataSchemaInfo = Pick<AppDataCandidate, 'content' | 'foundVersion' | 'supportedVersion'>;

const logger: Logger = createLogger('storage');

const fileNamePattern: RegExp = /^(\d+)\.(\d+)\.(\d+)_(\d+)__([a-z0-9_]+)\.sql$/;

export const devFailMigration: Migration = {
  id: '999.0.0_0__dev_fail',
  version: '999.0.0',
  upgradeNum: 0,
  sql: 'THIS IS NOT VALID SQL;',
};

function compareVersions(a: Versioned, b: Versioned): number {
  const left: number[] = [...a.version.split('.').map(Number), a.upgradeNum];
  const right: number[] = [...b.version.split('.').map(Number), b.upgradeNum];
  for (let i: number = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return 0;
}

function readMigrationFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name: string) => name.endsWith('.sql'));
  } catch (error) {
    throw new CodedError(ErrorCode.DbMigrationFailed, `migrations folder unreadable ${dir}: ${errorMessage(error)}`);
  }
}

export function loadMigrations(dir: string): Migration[] {
  const migrations: Migration[] = readMigrationFiles(dir).map((name: string) => {
    const match: RegExpMatchArray | null = name.match(fileNamePattern);
    if (!match) {
      throw new CodedError(ErrorCode.DbMigrationFailed, `invalid migration file name ${name}`);
    }
    return {
      id: name.slice(0, -'.sql'.length),
      version: `${match[1]}.${match[2]}.${match[3]}`,
      upgradeNum: Number(match[4]),
      sql: readFileSync(join(dir, name), 'utf8'),
    };
  });
  migrations.sort(compareVersions);
  migrations.forEach((migration: Migration, i: number) => {
    if (i > 0 && compareVersions(migrations[i - 1], migration) === 0) {
      throw new CodedError(
        ErrorCode.DbMigrationFailed,
        `duplicate migration version ${migration.version}_${migration.upgradeNum}`,
      );
    }
  });
  return migrations;
}

function readAppliedRows(db: Database): HistoryRow[] {
  const table: { name: string } | undefined = db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sys_migration_history'",
  );
  return table ? db.all<HistoryRow>('SELECT id, version, upgrade_num AS upgradeNum FROM sys_migration_history') : [];
}

function versionLabel(item: Versioned): string {
  return `${item.version}_${item.upgradeNum}`;
}

function newestLabel(items: Versioned[]): string | null {
  const newest: Versioned | undefined = [...items].sort(compareVersions).at(-1);
  return newest ? versionLabel(newest) : null;
}

export function readSchemaVersion(db: Database): string | null {
  return newestLabel(readAppliedRows(db));
}

export function classifyHistory(rows: HistoryRow[], migrations: Migration[]): AppDataSchemaInfo {
  const bundledIds: Set<string> = new Set(migrations.map((migration: Migration) => migration.id));
  const appliedIds: Set<string> = new Set(rows.map((row: HistoryRow) => row.id));
  let content: AppDataContent = 'current';
  if (rows.length === 0) {
    content = 'none';
  } else if (rows.some((row: HistoryRow) => !bundledIds.has(row.id))) {
    content = 'newer';
  } else if (migrations.some((migration: Migration) => !appliedIds.has(migration.id))) {
    content = 'older';
  }
  return {
    content,
    foundVersion: newestLabel(rows),
    supportedVersion: newestLabel(migrations) ?? '0.0.0_0',
  };
}

function assertNotNewer(rows: HistoryRow[], migrations: Migration[]): void {
  const known: Set<string> = new Set(migrations.map((migration: Migration) => migration.id));
  const unknown: HistoryRow[] = rows.filter((row: HistoryRow) => !known.has(row.id));
  if (unknown.length === 0) {
    return;
  }
  const newest: HistoryRow = unknown.sort(compareVersions).at(-1) as HistoryRow;
  const latest: string = migrations.at(-1)?.version ?? '0.0.0';
  throw new CodedError(
    ErrorCode.DbNewerVersion,
    `database has unknown migration ${newest.id}`,
    t('dialog.newerVersionNote', { found: newest.version, latest }),
  );
}

function backupDatabase(db: Database, backupFile: string): void {
  try {
    rmSync(backupFile, { force: true });
    db.exec(`VACUUM INTO '${backupFile.replaceAll("'", "''")}'`);
  } catch (error) {
    throw new CodedError(ErrorCode.DbMigrationFailed, `backup failed: ${errorMessage(error)}`);
  }
}

function applyMigration(db: Database, migration: Migration, backedUp: boolean): void {
  const start: number = Date.now();
  try {
    db.exec(migration.sql);
    db.run('INSERT INTO sys_migration_history (id, version, upgrade_num, applied_at) VALUES (?, ?, ?, ?)', [
      migration.id,
      migration.version,
      migration.upgradeNum,
      new Date().toISOString(),
    ]);
  } catch (error) {
    throw new CodedError(
      ErrorCode.DbMigrationFailed,
      `${migration.id}: ${errorMessage(error)}`,
      backedUp ? t('dialog.backupNote') : undefined,
    );
  }
  logger.info(`migration applied ${migration.id} in ${Date.now() - start} ms`);
}

export function runMigrations(db: Database, migrations: Migration[], backupFile: string): MigrationResult {
  const sorted: Migration[] = [...migrations].sort(compareVersions);
  const rows: HistoryRow[] = readAppliedRows(db);
  assertNotNewer(rows, sorted);
  const appliedIds: Set<string> = new Set(rows.map((row: HistoryRow) => row.id));
  const pending: Migration[] = sorted.filter((migration: Migration) => !appliedIds.has(migration.id));
  const backedUp: boolean = rows.length > 0 && pending.length > 0;
  if (backedUp) {
    backupDatabase(db, backupFile);
  }
  for (const migration of pending) {
    applyMigration(db, migration, backedUp);
  }
  return { applied: pending.map((migration: Migration) => migration.id) };
}
