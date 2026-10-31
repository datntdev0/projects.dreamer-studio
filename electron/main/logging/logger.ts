import { LogEntry } from '@dreamer/shared/ipc/log';
import { LogProvider } from './log-provider';

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export const logProvider: LogProvider = new LogProvider();

export function isLoggingReady(): boolean {
  return logProvider.isLoggingReady();
}

export function initLogging(dir: string): boolean {
  return logProvider.initLogging(dir);
}

export function createLogger(module: string): Logger {
  return logProvider.createLogger(module);
}

export function writeRendererLog(entry: LogEntry): void {
  logProvider.writeRendererLog(entry);
}
