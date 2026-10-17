import { LogLevel } from '@dreamer/shared/ipc/log';

export interface LogLine {
  time: Date;
  level: LogLevel;
  process: string;
  module: string;
  message: string;
  stack?: string;
}

export function formatLogLine(line: LogLine): string {
  const head: string = `${line.time.toISOString()} ${line.level.toUpperCase()} ${line.process} ${line.module} ${line.message}`;
  return line.stack ? `${head}\n${line.stack}` : head;
}
