import { AppError } from '../errors/app-error';

export type IpcResult<T> = { value: T } | { error: AppError };
