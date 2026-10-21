import { existsSync } from 'node:fs';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { createLogger, Logger } from '../logging/logger';

export type SqlParam = null | number | bigint | string | Uint8Array;

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

const logger: Logger = createLogger('storage');

const openPragmas: string[] = [
  'PRAGMA busy_timeout = 5000',
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
];

export class Database {
  private readonly statements: Map<string, StatementSync> = new Map();
  private lastErrorMessage: string | null = null;
  private closed: boolean = false;

  private constructor(private readonly handle: DatabaseSync) {}

  static open(file: string): Database {
    const existed: boolean = existsSync(file);
    let handle: DatabaseSync | null = null;
    try {
      handle = new DatabaseSync(file);
      for (const pragma of openPragmas) {
        handle.exec(pragma);
      }
      const row: { version: string } = handle.prepare('SELECT sqlite_version() AS version').get() as {
        version: string;
      };
      logger.info(`database ${existed ? 'opened' : 'created'} ${file}, sqlite ${row.version}`);
      return new Database(handle);
    } catch (error) {
      handle?.close();
      throw new CodedError(ErrorCode.DbOpenFailed, errorMessage(error), file);
    }
  }

  get<T>(sql: string, params: SqlParam[] = []): T | undefined {
    return this.guard(sql, () => this.statement(sql).get(...params) as T | undefined);
  }

  all<T>(sql: string, params: SqlParam[] = []): T[] {
    return this.guard(sql, () => this.statement(sql).all(...params) as T[]);
  }

  run(sql: string, params: SqlParam[] = []): RunResult {
    return this.guard(sql, () => this.statement(sql).run(...params));
  }

  exec(sql: string): void {
    this.guard(sql, () => this.handle.exec(sql));
  }

  transaction<T>(work: () => T): T {
    this.exec('BEGIN');
    try {
      const result: T = work();
      this.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.handle.isTransaction) {
        this.exec('ROLLBACK');
      }
      throw error;
    }
  }

  lastError(): string | null {
    return this.lastErrorMessage;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.handle.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (error) {
      logger.error('database checkpoint failed', error);
    }
    this.handle.close();
  }

  private guard<T>(sql: string, execute: () => T): T {
    try {
      return execute();
    } catch (error) {
      logger.error(`query failed: ${sql}`, error);
      this.lastErrorMessage = errorMessage(error);
      throw new CodedError(ErrorCode.DbQueryFailed, this.lastErrorMessage);
    }
  }

  private statement(sql: string): StatementSync {
    let statement: StatementSync | undefined = this.statements.get(sql);
    if (!statement) {
      statement = this.handle.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
}

const integrityError: CheckOutcome = {
  status: 'error',
  messageKey: 'diagnostics.check.database.integrity.error',
  fixKey: 'diagnostics.check.database.integrity.fix',
};

export function checkDatabase(db: Database): CheckOutcome {
  try {
    db.get('SELECT 1');
    const row: { quick_check: string } | undefined = db.get<{ quick_check: string }>('PRAGMA quick_check');
    if (row?.quick_check !== 'ok') {
      return integrityError;
    }
  } catch {
    return integrityError;
  }
  const error: string | null = db.lastError();
  if (error) {
    return {
      status: 'warning',
      messageKey: 'diagnostics.check.database.integrity.warning',
      fixKey: 'diagnostics.check.database.integrity.warningFix',
      params: { error },
    };
  }
  return { status: 'ok', messageKey: 'diagnostics.check.database.integrity.ok', fixKey: null };
}
