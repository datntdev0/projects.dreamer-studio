import { IpcController } from './ipc-controller';
import { ipcMain } from 'electron';
import { LogChannel } from '@dreamer/shared/ipc/channels';
import { LogEntry, LogLevel } from '@dreamer/shared/ipc/log';
import { LogProvider } from '../logging/log-provider';

const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function isLogEntry(value: unknown): value is LogEntry {
  const entry = value as Partial<LogEntry> | null;
  return (
    typeof entry === 'object' &&
    entry !== null &&
    levels.includes(entry.level as LogLevel) &&
    typeof entry.module === 'string' &&
    typeof entry.message === 'string' &&
    (entry.stack === undefined || typeof entry.stack === 'string')
  );
}

export class LogController implements IpcController {
  constructor(private readonly logging: LogProvider) {}

  register(): void {
    ipcMain.on(LogChannel.Write, (_event, entry: unknown) => {
      if (isLogEntry(entry)) {
        this.logging.writeRendererLog(entry);
      }
    });
  }
}
