import { app } from 'electron';
import log from 'electron-log/main';
import { appendFileSync, mkdirSync } from 'node:fs';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { LogEntry, LogLevel } from '@dreamer/shared/ipc/log';
import { datedLogFile, deleteOldLogs } from './log-files';
import { formatLogLine } from './log-format';
import type { Logger } from './logger';

interface LogPayload {
  process: string;
  module: string;
  message: string;
  stack?: string;
}

const filePrefix: string = 'main';
const keepDays: number = 7;
const mainProcess: string = 'main';
const rendererProcess: string = 'renderer';
const testLogDir: string | undefined = process.env.DREAMER_TEST_LOG_DIR;

function formatMessage({
  data,
  level,
  message,
}: {
  data: unknown[];
  level: string;
  message: { date: Date };
}): string[] {
  const payload: LogPayload = data[0] as LogPayload;
  return [formatLogLine({ time: message.date, level: level as LogLevel, ...payload })];
}

function canWrite(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(datedLogFile(dir, filePrefix, new Date()), '');
    return true;
  } catch {
    return false;
  }
}

function writeBeforeInit(level: LogLevel, payload: LogPayload): void {
  const now: Date = new Date();
  const line: string = formatLogLine({ time: now, level, ...payload });
  if (!testLogDir) {
    console[level === 'debug' ? 'log' : level](line);
    return;
  }
  mkdirSync(testLogDir, { recursive: true });

  appendFileSync(
    datedLogFile(testLogDir, filePrefix, now),
    `${line}
`,
  );
}

export class LogProvider {
  private logDir: string | null = null;
  private lastCleanupDay: string = '';

  private cleanupOnNewDay(now: Date): void {
    const key: string = now.toDateString();
    if (this.logDir && key !== this.lastCleanupDay) {
      this.lastCleanupDay = key;
      deleteOldLogs(this.logDir, filePrefix, now, keepDays);
    }
  }

  private write(level: LogLevel, payload: LogPayload): void {
    if (!this.logDir) {
      writeBeforeInit(level, payload);
      return;
    }
    this.cleanupOnNewDay(new Date());
    log[level](payload);
  }

  isLoggingReady(): boolean {
    return this.logDir !== null;
  }

  initLogging(dir: string): boolean {
    const writable: boolean = canWrite(dir);
    const level: LogLevel = app.isPackaged ? 'info' : 'debug';
    log.transports.file.resolvePathFn = (): string => datedLogFile(dir, filePrefix, new Date());
    log.transports.file.maxSize = 0;
    log.transports.file.format = formatMessage;
    log.transports.file.level = writable ? level : false;
    log.transports.console.format = formatMessage;
    log.transports.console.level = app.isPackaged && writable ? false : level;
    this.logDir = dir;
    this.lastCleanupDay = '';
    this.cleanupOnNewDay(new Date());
    return writable;
  }

  createLogger(module: string): Logger {
    const emit = (level: LogLevel, message: string, error?: unknown): void =>
      this.write(level, {
        process: mainProcess,
        module,
        message,
        stack: error === undefined ? undefined : errorStack(error),
      });
    return {
      debug: (message: string): void => emit('debug', message),
      info: (message: string): void => emit('info', message),
      warn: (message: string): void => emit('warn', message),
      error: (message: string, error?: unknown): void => emit('error', message, error),
    };
  }

  writeRendererLog(entry: LogEntry): void {
    this.write(entry.level, {
      process: rendererProcess,
      module: entry.module,
      message: entry.message,
      stack: entry.stack,
    });
  }
}
