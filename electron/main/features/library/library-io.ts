import { rename } from 'node:fs/promises';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { sleep } from '../pipelines/pipeline-definition';

const renameDelayMs: number = 200;
const renameRetries: number = 3;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRetryableRename(error: unknown): boolean {
  const code: string | undefined = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

export function asWriteError(error: unknown): never {
  if (error instanceof CodedError || isAbortError(error)) {
    throw error;
  }
  throw new CodedError(ErrorCode.LibraryWriteFailed, errorMessage(error));
}

export async function renameWithRetry(source: string, destination: string, signal: AbortSignal): Promise<void> {
  for (let attempt: number = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error: unknown) {
      if (!isRetryableRename(error) || attempt >= renameRetries) {
        throw error;
      }
      await sleep(renameDelayMs, signal);
    }
  }
}
