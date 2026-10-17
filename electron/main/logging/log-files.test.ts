import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { datedLogFile, deleteOldLogs } from './log-files';

describe('datedLogFile', () => {
  it('builds the file name from the prefix and the local date', () => {
    expect(datedLogFile('logs', 'main', new Date(2026, 9, 17, 8, 4, 5))).toBe(join('logs', 'main-2026-10-17.log'));
  });

  it('uses the local date near midnight', () => {
    expect(datedLogFile('logs', 'backend', new Date(2026, 9, 17, 23, 59))).toBe(join('logs', 'backend-2026-10-17.log'));
  });

  it('zero-pads month and day', () => {
    expect(datedLogFile('logs', 'main', new Date(2026, 0, 5, 12))).toBe(join('logs', 'main-2026-01-05.log'));
  });
});

describe('deleteOldLogs', () => {
  const now: Date = new Date(2026, 9, 17, 12);
  let dir: string;

  const touch = (name: string): void => writeFileSync(join(dir, name), 'x');
  const remaining = (): string[] => readdirSync(dir).sort();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dreamer-logs-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the last keepDays days and deletes older ones', () => {
    ['main-2026-10-09.log', 'main-2026-10-10.log', 'main-2026-10-11.log', 'main-2026-10-17.log'].forEach(touch);
    deleteOldLogs(dir, 'main', now, 7);
    expect(remaining()).toEqual(['main-2026-10-11.log', 'main-2026-10-17.log']);
  });

  it('deletes a file exactly keepDays days old and keeps one day newer', () => {
    ['main-2026-10-10.log', 'main-2026-10-11.log'].forEach(touch);
    deleteOldLogs(dir, 'main', now, 7);
    expect(existsSync(join(dir, 'main-2026-10-10.log'))).toBe(false);
    expect(existsSync(join(dir, 'main-2026-10-11.log'))).toBe(true);
  });

  it('leaves files of other prefixes and other names untouched', () => {
    ['backend-2026-01-01.log', 'notes.txt', 'main-old.log', 'main-2026-01-01.txt'].forEach(touch);
    deleteOldLogs(dir, 'main', now, 7);
    expect(remaining()).toEqual(['backend-2026-01-01.log', 'main-2026-01-01.txt', 'main-old.log', 'notes.txt']);
  });

  it('does not throw when the directory is missing', () => {
    const missing: string = join(dir, 'missing');
    mkdirSync(dir, { recursive: true });
    expect(() => deleteOldLogs(missing, 'main', now, 7)).not.toThrow();
  });
});
