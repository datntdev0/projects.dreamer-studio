import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppPaths, defaultAppDataRoot, ensureFolders, resolveAppPaths } from './paths';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData' } }));

describe('resolveAppPaths', () => {
  beforeEach(() => {
    vi.stubEnv('LOCALAPPDATA', join('local', 'app'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('places every folder and file under the root', () => {
    const root: string = join('data', 'studio');
    const paths: AppPaths = resolveAppPaths(root);
    expect(paths).toEqual({
      settingsFile: join(defaultAppDataRoot(), 'settings.json'),
      root,
      database: join(root, 'database.sqlite'),
      databaseBackup: join(root, 'database.backup.sqlite'),
      library: join(root, 'library'),
      logs: join(root, 'logs'),
      pipelineLogs: join(root, 'logs', 'pipelines'),
      promptLogs: join(root, 'logs', 'prompts'),
      cache: join(root, 'cache'),
      llmCache: join(root, 'cache', 'llm'),
    });
  });

  it('keeps the settings file in the default folder when the root differs', () => {
    const paths: AppPaths = resolveAppPaths(join('elsewhere', 'studio'));
    expect(paths.settingsFile).toBe(join('local', 'app', 'DreamerStudio', 'settings.json'));
  });
});

describe('ensureFolders', () => {
  let tempDir: string;
  let paths: AppPaths;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dreamer-paths-'));
    paths = resolveAppPaths(join(tempDir, 'studio'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the library, logs and cache folders under a new root', () => {
    ensureFolders(paths);
    expect(existsSync(paths.library)).toBe(true);
    expect(existsSync(paths.logs)).toBe(true);
    expect(existsSync(paths.cache)).toBe(true);
    expect(existsSync(paths.llmCache)).toBe(false);
  });

  it('recreates a missing folder and keeps existing files', () => {
    ensureFolders(paths);
    const keptFile: string = join(paths.library, 'kept.txt');
    writeFileSync(keptFile, 'data');
    rmSync(paths.cache, { recursive: true });
    ensureFolders(paths);
    expect(existsSync(paths.cache)).toBe(true);
    expect(existsSync(keptFile)).toBe(true);
  });

  it('throws APP_DATA_UNWRITABLE with the folder when a file blocks it', () => {
    ensureFolders(paths);
    rmSync(paths.cache, { recursive: true });
    writeFileSync(paths.cache, 'not a folder');
    let error: CodedError | undefined;
    try {
      ensureFolders(paths);
    } catch (caught) {
      error = caught as CodedError;
    }
    expect(error).toBeInstanceOf(CodedError);
    expect(error?.code).toBe(ErrorCode.AppDataUnwritable);
    expect(error?.details).toBe(paths.cache);
  });
});
