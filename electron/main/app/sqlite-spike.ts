import { DatabaseSync } from 'node:sqlite';

export function logStartupInfo(): void {
  console.info(`[main] app ${APP_VERSION}, electron ${process.versions.electron}`);
  try {
    const db: DatabaseSync = new DatabaseSync(':memory:');
    const row = db.prepare('select sqlite_version() as version').get() as { version: string };
    db.close();
    console.info(`[main] sqlite ${row.version}`);
  } catch (error) {
    console.error('[main] node:sqlite failed', error);
  }
}
