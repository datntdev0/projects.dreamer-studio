import { ErrorCode } from './app-error';

export interface ErrorCopy {
  title: string;
  message: string;
}

export const errorCopy: Record<ErrorCode, ErrorCopy> = {
  UI_UNEXPECTED: { title: 'Something went wrong', message: 'The app hit an unexpected error. You can keep working.' },
  MAIN_UNEXPECTED: { title: 'Something went wrong', message: 'The app hit an unexpected error. You can keep working.' },
  RENDERER_GONE: { title: 'The window stopped working.', message: 'Reload the window to keep working.' },
  BACKEND_UNAVAILABLE: { title: 'AI backend is not running', message: 'Some features are unavailable.' },
};

export const errorText = {
  code: 'Code',
  openLogs: 'Open logs folder',
  dismiss: 'Dismiss',
  quit: 'Quit',
  reload: 'Reload',
  dialogTitle: 'Dreamer Studio – Unexpected error',
  mainDialogMessage: 'Something went wrong in the app.',
  savedToLogs: 'Details were saved to the logs.',
  logsNotWritable: 'Logs cannot be written to this folder:',
} as const;
