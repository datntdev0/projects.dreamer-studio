import { workspace } from '../support/fixtures';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The production build entry is JavaScript without TypeScript declarations.
import { createBuildOptions, readAppVersion } from '../../esbuild.mjs';
import { datedLogFile, deleteOldLogs } from '../../main/logging/log-files';
import { formatLogLine } from '../../main/logging/log-format';

describe('[TH01-01] L2-TH01-01-01 build identity and logging contracts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('AC4 derives both reported and compiled version from the root package', () => {
    const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    vi.stubEnv('DREAMER_BUILD_DATE', '2026-10-31');
    const options = createBuildOptions();
    expect(readAppVersion()).toBe(metadata.version);
    expect(JSON.parse(options.define.APP_VERSION)).toBe(metadata.version);
    expect(JSON.parse(options.define.APP_AUTHOR)).toBe(metadata.author);
    expect(JSON.parse(options.define.BUILD_DATE)).toBe('2026-10-31');
    expect(
      Object.fromEntries(Object.entries(options.entryPoints).map(([name, path]) => [name, resolve(path as string)])),
    ).toEqual({
      'main/index': resolve('electron/main/index.ts'),
      'preload/index': resolve('electron/preload/index.ts'),
    });
    expect(options).toMatchObject({
      platform: 'node',
      format: 'cjs',
      bundle: true,
      external: ['electron'],
      outExtension: { '.js': '.cjs' },
    });
  });

  it('AC3 formats an unhandled error with time, severity, process, module and stack', () => {
    const error = new Error('Unexpected failure');
    const line = formatLogLine({
      time: new Date('2026-10-31T00:00:00Z'),
      level: 'error',
      process: 'main',
      module: 'app',
      message: error.message,
      stack: error.stack,
    });
    expect(line).toContain('2026-10-31T00:00:00.000Z ERROR main app Unexpected failure');
    expect(line).toContain(error.stack);
  });

  it('retains recent app-data logs while removing expired logs without touching other files', () => {
    const work = workspace();
    try {
      const now = new Date(2026, 9, 31, 12);
      const expired = datedLogFile(work.paths.logs, 'main', new Date(2026, 9, 1, 12));
      const recent = datedLogFile(work.paths.logs, 'main', now);
      const other = join(work.paths.logs, 'notes.txt');
      for (const file of [expired, recent, other]) writeFileSync(file, 'preserve unless expired');
      deleteOldLogs(work.paths.logs, 'main', now, 7);
      expect(existsSync(expired)).toBe(false);
      expect(existsSync(recent)).toBe(true);
      expect(existsSync(other)).toBe(true);
      expect(() => deleteOldLogs(join(work.root, 'absent'), 'main', now, 7)).not.toThrow();
    } finally {
      work.dispose();
    }
  });
});
