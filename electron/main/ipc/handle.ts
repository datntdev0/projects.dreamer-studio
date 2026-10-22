import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { IpcResult } from '@dreamer/shared/ipc/ipc-result';
import { createLogger, Logger } from '../logging/logger';

const logger: Logger = createLogger('ipc');

function toIpcError(channel: string, error: unknown): IpcResult<never> {
  if (error instanceof CodedError) {
    return { error: { code: error.code, message: error.message, details: error.details } };
  }
  logger.error(`Handler ${channel} failed`, error);
  return { error: { code: ErrorCode.MainUnexpected, message: error instanceof Error ? error.message : String(error) } };
}

export function handle<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: A): Promise<IpcResult<R>> => {
    try {
      return { value: await fn(event, ...args) };
    } catch (error) {
      return toIpcError(channel, error);
    }
  });
}

export function handleValidated<T, R>(
  channel: string,
  guard: (value: unknown) => value is T,
  run: (payload: T) => R,
): void {
  handle(channel, (_event, payload: unknown): R => {
    if (!guard(payload)) {
      throw new Error(`Invalid ${channel} payload`);
    }
    return run(payload);
  });
}
