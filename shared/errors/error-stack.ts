import { isAppError } from './app-error';

export function errorStack(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error || isAppError(error) ? error.message : String(error);
}
