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
  AppDataPipelinesActive: 'APP_DATA_PIPELINES_ACTIVE',
  AppDataSwitching: 'APP_DATA_SWITCHING',
  PipelineNotFound: 'PIPELINE_NOT_FOUND',
  PipelineUnknownType: 'PIPELINE_UNKNOWN_TYPE',
  SettingsInvalid: 'SETTINGS_INVALID',
  SettingsWriteFailed: 'SETTINGS_WRITE_FAILED',
  LlmPathInvalid: 'LLM_PATH_INVALID',
  LlmNotSignedIn: 'LLM_NOT_SIGNED_IN',
  LlmTimeout: 'LLM_TIMEOUT',
  LlmCliFailed: 'LLM_CLI_FAILED',
  LlmBadOutput: 'LLM_BAD_OUTPUT',
  LlmNotAvailable: 'LLM_NOT_AVAILABLE',
  PackageUnreadable: 'PACKAGE_UNREADABLE',
  PackageChanged: 'PACKAGE_CHANGED',
  LibraryWriteFailed: 'LIBRARY_WRITE_FAILED',
  NovelNotFound: 'NOVEL_NOT_FOUND',
  NovelLocked: 'NOVEL_LOCKED',
  NovelMetadataInvalid: 'NOVEL_METADATA_INVALID',
  CoverInvalid: 'COVER_INVALID',
  ChapterFileMissing: 'CHAPTER_FILE_MISSING',
  ChapterChangeInvalid: 'CHAPTER_CHANGE_INVALID',
  OntologyInvalid: 'ONTOLOGY_INVALID',
  AnalysisNothingToRun: 'ANALYSIS_NOTHING_TO_RUN',
  AnalysisLlmOutputInvalid: 'ANALYSIS_LLM_OUTPUT_INVALID',
  NotImplemented: 'NOT_IMPLEMENTED',
  AnalysisOpenIssues: 'ANALYSIS_OPEN_ISSUES',
  AnalysisEditInvalid: 'ANALYSIS_EDIT_INVALID',
  AnalysisQuoteNotFound: 'ANALYSIS_QUOTE_NOT_FOUND',
  GlossaryKeyNotFound: 'GLOSSARY_KEY_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: string;
}

export function isAppError(value: unknown): value is AppError {
  const error = value as Partial<AppError> | null;
  return (
    typeof error === 'object' && error !== null && typeof error.code === 'string' && typeof error.message === 'string'
  );
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
