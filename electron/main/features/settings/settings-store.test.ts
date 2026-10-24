import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppSettings, DEFAULT_READING_SETTINGS, defaultSettings } from '@dreamer/shared/models/settings';
import { SettingsStore } from './settings-store';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const defaultDir: string = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';

describe('SettingsStore', () => {
  let tempDir: string;
  let file: string;

  function readFile(path: string = file): AppSettings {
    return JSON.parse(readFileSync(path, 'utf8')) as AppSettings;
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dreamer-settings-'));
    file = join(tempDir, 'nested', 'settings.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes the defaults when the file is missing', () => {
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load()).toEqual({ notice: 'none', invalid: [] });
    expect(readFile()).toEqual(defaultSettings(defaultDir));
    expect(store.get()).toEqual(defaultSettings(defaultDir));
    expect(store.state()).toEqual({
      settings: defaultSettings(defaultDir),
      defaultAppDataDir: defaultDir,
      notice: 'none',
    });
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('does not rewrite a valid file', () => {
    new SettingsStore(file, defaultDir).load();
    const text: string = JSON.stringify({ ...defaultSettings(defaultDir), language: 'vi' });
    writeFileSync(file, text);
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load()).toEqual({ notice: 'none', invalid: [] });
    expect(readFileSync(file, 'utf8')).toBe(text);
    expect(store.get().language).toBe('vi');
  });

  it('loads a settings file written before reading settings existed without a notice', () => {
    new SettingsStore(file, defaultDir).load();
    const old: Record<string, unknown> = { ...defaultSettings(defaultDir) };
    delete old.reading;
    const text: string = JSON.stringify(old);
    writeFileSync(file, text);
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load()).toEqual({ notice: 'none', invalid: [] });
    expect(store.get().reading).toEqual(DEFAULT_READING_SETTINGS);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('fixes one bad field, keeps the others and rewrites the file', () => {
    new SettingsStore(file, defaultDir).load();
    writeFileSync(file, JSON.stringify({ ...defaultSettings(defaultDir), language: 'vi', theme: 'blue' }));
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load()).toEqual({ notice: 'invalidFields', invalid: ['theme'] });
    expect(readFile()).toEqual({ ...defaultSettings(defaultDir), language: 'vi' });
    expect(store.state().notice).toBe('invalidFields');
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('clamps reading values in settings.json and reports the changed fields', () => {
    new SettingsStore(file, defaultDir).load();
    writeFileSync(
      file,
      JSON.stringify({ ...defaultSettings(defaultDir), reading: { font: 'sans', size: 30, leading: 1.76, width: 47 } }),
    );
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load()).toEqual({
      notice: 'invalidFields',
      invalid: ['reading.size', 'reading.leading', 'reading.width'],
    });
    expect(readFile().reading).toEqual({ font: 'sans', size: 28, leading: 1.75, width: 48 });
  });

  it.each([['{ not json'], ['[1, 2]']])('backs up %s and writes the defaults', (content: string) => {
    new SettingsStore(file, defaultDir).load();
    writeFileSync(file, content);
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load().notice).toBe('unreadable');
    expect(readFileSync(`${file}.bak`, 'utf8')).toBe(content);
    expect(readFile()).toEqual(defaultSettings(defaultDir));
    expect(store.get()).toEqual(defaultSettings(defaultDir));
  });

  it('uses the defaults without touching a file it cannot read', () => {
    mkdirSync(file, { recursive: true });
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load().notice).toBe('unreadable');
    expect(store.get()).toEqual(defaultSettings(defaultDir));
    expect(statSync(file).isDirectory()).toBe(true);
    expect(existsSync(`${file}.bak`)).toBe(false);
  });

  it('persists setAppDataDir and leaves no temp file', () => {
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    store.load();
    store.setAppDataDir('D:\\studio');
    expect(store.get().appDataDir).toBe('D:\\studio');
    expect(readFile().appDataDir).toBe('D:\\studio');
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  describe('update and reset', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore(file, defaultDir);
      store.load();
    });

    function catchError(action: () => unknown): CodedError {
      try {
        action();
      } catch (error) {
        return error as CodedError;
      }
      throw new Error('expected an error');
    }

    it('update returns the new settings and persists them', () => {
      const result: AppSettings = store.update({ language: 'vi', pipelines: { maxConcurrent: 3 } });
      const expected: AppSettings = { ...defaultSettings(defaultDir), language: 'vi', pipelines: { maxConcurrent: 3 } };
      expect(result).toEqual(expected);
      expect(store.get()).toEqual(expected);
      expect(readFile()).toEqual(expected);
    });

    it.each([
      ['patch', {}],
      ['patch', { appDataDir: 'D:\\x' }],
      ['theme', { theme: 'blue' }],
      ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 9 } }],
    ])('rejects the invalid patch (%s) %j and changes nothing', (field: string, patch: unknown) => {
      const listener = vi.fn();
      store.onChange(listener);
      const error: CodedError = catchError(() => store.update(patch as never));
      expect(error).toBeInstanceOf(CodedError);
      expect(error.code).toBe(ErrorCode.SettingsInvalid);
      expect(error.details).toBe(field);
      expect(store.get()).toEqual(defaultSettings(defaultDir));
      expect(readFile()).toEqual(defaultSettings(defaultDir));
      expect(listener).not.toHaveBeenCalled();
    });

    it('reset general restores language and theme only', () => {
      store.update({ language: 'vi', theme: 'dark', pipelines: { maxConcurrent: 4 } });
      store.setAppDataDir('D:\\studio');
      const result: AppSettings = store.reset('general');
      const expected: AppSettings = { ...defaultSettings('D:\\studio'), pipelines: { maxConcurrent: 4 } };
      expect(result).toEqual(expected);
      expect(readFile()).toEqual(expected);
    });

    it('reset pipeline restores maxConcurrent only', () => {
      store.update({ language: 'vi', theme: 'dark', pipelines: { maxConcurrent: 4 } });
      const result: AppSettings = store.reset('pipeline');
      expect(result).toEqual({ ...defaultSettings(defaultDir), language: 'vi', theme: 'dark' });
      expect(readFile()).toEqual(result);
    });

    it('reset reading restores only reading settings', () => {
      const reading: AppSettings['reading'] = { font: 'sans', size: 24, leading: 2, width: 84 };
      store.update({ language: 'vi', pipelines: { maxConcurrent: 3 }, reading });
      const result: AppSettings = store.reset('reading');
      expect(result).toEqual({ ...defaultSettings(defaultDir), language: 'vi', pipelines: { maxConcurrent: 3 } });
      expect(readFile()).toEqual(result);
    });

    it('calls the listener after update and reset', () => {
      const listener = vi.fn();
      store.onChange(listener);
      const updated: AppSettings = store.update({ theme: 'dark' });
      expect(listener).toHaveBeenLastCalledWith(updated);
      const reset: AppSettings = store.reset('general');
      expect(listener).toHaveBeenLastCalledWith(reset);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps the new value and calls the listener when the write fails', () => {
      mkdirSync(`${file}.tmp`);
      const listener = vi.fn();
      store.onChange(listener);
      const error: CodedError = catchError(() => store.update({ theme: 'dark' }));
      expect(error).toBeInstanceOf(CodedError);
      expect(error.code).toBe(ErrorCode.SettingsWriteFailed);
      expect(store.get().theme).toBe('dark');
      expect(listener).toHaveBeenCalledWith(store.get());
    });
  });
});
