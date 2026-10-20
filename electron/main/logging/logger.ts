import { app } from 'electron';
import log from 'electron-log/main';
import { appendFileSync, mkdirSync } from 'node:fs';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { LogEntry, LogLevel } from '@dreamer/shared/ipc/log';
import { datedLogFile, deleteOldLogs } from './log-files';
import { formatLogLine } from './log-format';

interface LogPayload {
  process: string;
  module: string;
  message: string;
  stack?: string;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

const filePrefix: string = 'main';
const keepDays: number = 7;
const mainProcess: string = 'main';
const rendererProcess: string = 'renderer';

let logDir: string | null = null;
let lastCleanupDay: string = '';

function cleanupOnNewDay(now: Date): void {
  const key: string = now.toDateString();
  if (logDir && key !== lastCleanupDay) {
    lastCleanupDay = key;
    deleteOldLogs(logDir, filePrefix, now, keepDays);
  }
}

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

function write(level: LogLevel, payload: LogPayload): void {
  if (!logDir) {
    console[level === 'debug' ? 'log' : level](formatLogLine({ time: new Date(), level, ...payload }));
    return;
  }
  cleanupOnNewDay(new Date());
  log[level](payload);
}

export function isLoggingReady(): boolean {
  return logDir !== null;
}

export function initLogging(dir: string): boolean {
  const writable: boolean = canWrite(dir);
  const level: LogLevel = app.isPackaged ? 'info' : 'debug';
  log.transports.file.resolvePathFn = (): string => datedLogFile(dir, filePrefix, new Date());
  log.transports.file.maxSize = 0;
  log.transports.file.format = formatMessage;
  log.transports.file.level = writable ? level : false;
  log.transports.console.format = formatMessage;
  log.transports.console.level = app.isPackaged && writable ? false : level;
  logDir = dir;
  lastCleanupDay = '';
  cleanupOnNewDay(new Date());
  return writable;
}

export function createLogger(module: string): Logger {
  const emit = (level: LogLevel, message: string, error?: unknown): void =>
    write(level, { process: mainProcess, module, message, stack: error === undefined ? undefined : errorStack(error) });
  return {
    debug: (message: string): void => emit('debug', message),
    info: (message: string): void => emit('info', message),
    warn: (message: string): void => emit('warn', message),
    error: (message: string, error?: unknown): void => emit('error', message, error),
  };
}

export function writeRendererLog(entry: LogEntry): void {
  write(entry.level, { process: rendererProcess, module: entry.module, message: entry.message, stack: entry.stack });
}
