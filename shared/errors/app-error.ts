export const ErrorCode = {
  UiUnexpected: 'UI_UNEXPECTED',
  MainUnexpected: 'MAIN_UNEXPECTED',
  RendererGone: 'RENDERER_GONE',
  BackendUnavailable: 'BACKEND_UNAVAILABLE',
  DbOpenFailed: 'DB_OPEN_FAILED',
  DbQueryFailed: 'DB_QUERY_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: string;
}

export class CodedError extends Error {
  readonly code: ErrorCode;
  readonly details?: string;

  constructor(code: ErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'CodedError';
    this.code = code;
    this.details = details;
  }
}
