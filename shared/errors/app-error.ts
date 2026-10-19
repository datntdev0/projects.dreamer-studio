export const ErrorCode = {
  UiUnexpected: 'UI_UNEXPECTED',
  MainUnexpected: 'MAIN_UNEXPECTED',
  RendererGone: 'RENDERER_GONE',
  BackendUnavailable: 'BACKEND_UNAVAILABLE',
  DbOpenFailed: 'DB_OPEN_FAILED',
  DbQueryFailed: 'DB_QUERY_FAILED',
  DbMigrationFailed: 'DB_MIGRATION_FAILED',
  DbNewerVersion: 'DB_NEWER_VERSION',
  AppDataUnwritable: 'APP_DATA_UNWRITABLE',
  PipelineNotFound: 'PIPELINE_NOT_FOUND',
  PipelineUnknownType: 'PIPELINE_UNKNOWN_TYPE',
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
