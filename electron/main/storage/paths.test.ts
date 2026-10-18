import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppPaths, defaultAppDataRoot, resolveAppPaths } from './paths';

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
      cache: join(root, 'cache'),
    });
  });

  it('keeps the settings file in the default folder when the root differs', () => {
    const paths: AppPaths = resolveAppPaths(join('elsewhere', 'studio'));
    expect(paths.settingsFile).toBe(join('local', 'app', 'DreamerStudio', 'settings.json'));
  });
});
