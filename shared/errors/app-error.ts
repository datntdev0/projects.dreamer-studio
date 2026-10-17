export const ErrorCode = {
  UiUnexpected: 'UI_UNEXPECTED',
  MainUnexpected: 'MAIN_UNEXPECTED',
  RendererGone: 'RENDERER_GONE',
  BackendUnavailable: 'BACKEND_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: string;
}
