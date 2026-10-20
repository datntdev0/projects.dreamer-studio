import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettings, defaultSettings } from '@dreamer/shared/models/settings';
import { SettingsStore } from './settings-store';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../logging/logger', () => ({
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

  it('fixes one bad field, keeps the others and rewrites the file', () => {
    new SettingsStore(file, defaultDir).load();
    writeFileSync(file, JSON.stringify({ ...defaultSettings(defaultDir), language: 'vi', theme: 'blue' }));
    const store: SettingsStore = new SettingsStore(file, defaultDir);
    expect(store.load()).toEqual({ notice: 'invalidFields', invalid: ['theme'] });
    expect(readFile()).toEqual({ ...defaultSettings(defaultDir), language: 'vi' });
    expect(store.state().notice).toBe('invalidFields');
    expect(existsSync(`${file}.tmp`)).toBe(false);
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
});
