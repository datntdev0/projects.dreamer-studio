import { DatabaseSync } from 'node:sqlite';
import { createLogger, Logger } from '../logging/logger';

const logger: Logger = createLogger('startup');

export function logStartupInfo(): void {
  logger.info(`app ${APP_VERSION}, electron ${process.versions.electron}`);
  try {
    const db: DatabaseSync = new DatabaseSync(':memory:');
    const row = db.prepare('select sqlite_version() as version').get() as { version: string };
    db.close();
    logger.info(`sqlite ${row.version}`);
  } catch (error) {
    logger.error('node:sqlite failed', error);
  }
}
