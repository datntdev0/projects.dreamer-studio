import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { LlmCliId } from '@dreamer/shared/models/llm';
import { AppSettings, defaultSettings, isPlainObject, sanitizeSettings } from '@dreamer/shared/models/settings';
import { SettingsNotice, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { validateSettingsPatch } from '@dreamer/shared/models/settings';
import { createLogger, Logger } from '../../logging/logger';

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
  private listeners: ((settings: AppSettings) => void)[] = [];

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
    this.notify();
  }

  update(patch: SettingsPatch): AppSettings {
    const field: string | null = validateSettingsPatch(patch);
    if (field !== null) {
      throw new CodedError(ErrorCode.SettingsInvalid, `Invalid settings patch: ${field}`, field);
    }
    return this.commit({
      ...this.settings,
      ...patch,
      pipelines: { ...this.settings.pipelines, ...patch.pipelines },
      llm: { ...this.settings.llm, ...patch.llm },
    });
  }

  setLlmPath(cli: LlmCliId, path: string | null): AppSettings {
    const paths: AppSettings['llm']['paths'] = { ...this.settings.llm.paths };
    if (path === null) {
      delete paths[cli];
    } else {
      paths[cli] = path;
    }
    return this.commit({ ...this.settings, llm: { ...this.settings.llm, paths } });
  }

  reset(section: SettingsSection): AppSettings {
    const defaults: AppSettings = defaultSettings(this.defaultDir);
    if (section === 'general') {
      return this.commit({
        ...this.settings,
        language: defaults.language,
        theme: defaults.theme,
        rail: defaults.rail,
      });
    }
    if (section === 'reading') {
      return this.commit({ ...this.settings, reading: defaults.reading });
    }
    if (section === 'llm') {
      return this.commit({ ...this.settings, llm: { ...this.settings.llm, features: {} } });
    }
    return this.commit({ ...this.settings, pipelines: defaults.pipelines });
  }

  onChange(listener: (settings: AppSettings) => void): void {
    this.listeners.push(listener);
  }

  private commit(settings: AppSettings): AppSettings {
    this.settings = settings;
    const written: boolean = this.write();
    this.notify();
    if (!written) {
      throw new CodedError(ErrorCode.SettingsWriteFailed, 'settings.json could not be written');
    }
    return settings;
  }

  private notify(): void {
    this.listeners.forEach((listener: (settings: AppSettings) => void): void => listener(this.settings));
  }

  private backup(): void {
    try {
      copyFileSync(this.file, `${this.file}.bak`);
    } catch (error) {
      logger.error('settings backup failed', error);
    }
  }

  private write(): boolean {
    const temp: string = `${this.file}.tmp`;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(temp, `${JSON.stringify(this.settings, null, 2)}\n`, 'utf-8');
      renameSync(temp, this.file);
      return true;
    } catch (error) {
      logger.error('settings write failed', error);
      return false;
    }
  }
}
