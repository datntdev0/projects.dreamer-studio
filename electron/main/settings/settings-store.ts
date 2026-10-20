import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppSettings, defaultSettings, isPlainObject, sanitizeSettings } from '@dreamer/shared/models/settings';
import { SettingsNotice, SettingsState } from '@dreamer/shared/models/settings';
import { createLogger, Logger } from '../logging/logger';

const logger: Logger = createLogger('settings');

export interface SettingsLoadResult {
  notice: SettingsNotice;
  invalid: string[];
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export class SettingsStore {
  private settings: AppSettings;
  private notice: SettingsNotice = 'none';

  constructor(
    private readonly file: string,
    private readonly defaultDir: string,
  ) {
    this.settings = defaultSettings(defaultDir);
  }

  load(): SettingsLoadResult {
    let text: string;
    try {
      text = readFileSync(this.file, 'utf-8');
    } catch (error) {
      if (isMissingFile(error)) {
        this.write();
        return { notice: 'none', invalid: [] };
      }
      logger.error('settings read failed, defaults used and the file is left as is', error);
      this.notice = 'unreadable';
      return { notice: this.notice, invalid: [] };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = undefined;
    }
    const { settings, invalid } = sanitizeSettings(raw, this.defaultDir);
    this.settings = settings;
    if (!isPlainObject(raw)) {
      this.backup();
      this.notice = 'unreadable';
      this.write();
    } else if (invalid.length > 0) {
      this.notice = 'invalidFields';
      this.write();
    }
    return { notice: this.notice, invalid };
  }

  get(): AppSettings {
    return this.settings;
  }

  state(): SettingsState {
    return { settings: this.settings, defaultAppDataDir: this.defaultDir, notice: this.notice };
  }

  setAppDataDir(dir: string): void {
    this.settings = { ...this.settings, appDataDir: dir };
    this.write();
  }

  private backup(): void {
    try {
      copyFileSync(this.file, `${this.file}.bak`);
    } catch (error) {
      logger.error('settings backup failed', error);
    }
  }

  private write(): void {
    const temp: string = `${this.file}.tmp`;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(temp, `${JSON.stringify(this.settings, null, 2)}\n`, 'utf-8');
      renameSync(temp, this.file);
    } catch (error) {
      logger.error('settings write failed', error);
    }
  }
}
