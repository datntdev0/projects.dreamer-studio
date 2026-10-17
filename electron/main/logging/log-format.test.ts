import { describe, expect, it } from 'vitest';
import type { LogLevel } from '@dreamer/shared/ipc/log';
import { formatLogLine } from './log-format';
import type { LogLine } from './log-format';

const time: Date = new Date('2026-10-17T08:04:05.123Z');

describe('formatLogLine', () => {
  it.each<LogLevel>(['debug', 'info', 'warn', 'error'])('formats a %s line', (level: LogLevel) => {
    const line: LogLine = { time, level, process: 'main', module: 'backend', message: 'Backend ready on port 51234' };
    expect(formatLogLine(line)).toBe(
      `2026-10-17T08:04:05.123Z ${level.toUpperCase()} main backend Backend ready on port 51234`,
    );
  });

  it('appends the stack on a new line', () => {
    const line: LogLine = {
      time,
      level: 'error',
      process: 'renderer',
      module: 'ipc',
      message: 'failed',
      stack: 'Error: failed\n    at x',
    };
    expect(formatLogLine(line)).toBe('2026-10-17T08:04:05.123Z ERROR renderer ipc failed\nError: failed\n    at x');
  });
});
