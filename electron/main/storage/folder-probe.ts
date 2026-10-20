import { existsSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { HistoryRow } from './migrator';

const probeFileName: string = '.dreamer-write-test';

export function probeWritable(dir: string): boolean {
  const file: string = join(dir, probeFileName);
  try {
    writeFileSync(file, '');
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

export function isSameFolder(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

export function freeBytes(dir: string): number | null {
  try {
    const stats: { bavail: number; bsize: number } = statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

export function readHistoryRows(file: string): HistoryRow[] {
  if (!existsSync(file)) {
    return [];
  }
  const url: URL = pathToFileURL(file);
  url.searchParams.set('immutable', '1');
  let handle: DatabaseSync | null = null;
  try {
    handle = new DatabaseSync(url, { readOnly: true });
    const table: unknown = handle
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sys_migration_history'")
      .get();
    return table
      ? (handle
          .prepare('SELECT id, version, upgrade_num AS upgradeNum FROM sys_migration_history')
          .all() as unknown as HistoryRow[])
      : [];
  } catch (error) {
    throw new CodedError(ErrorCode.DbOpenFailed, errorMessage(error), file);
  } finally {
    handle?.close();
  }
}
