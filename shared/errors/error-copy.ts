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
  DB_OPEN_FAILED: {
    title: 'Local data could not be opened.',
    message: 'The database may be in use by another program, damaged, or blocked.',
  },
  DB_QUERY_FAILED: {
    title: 'Local data could not be read or saved.',
    message: 'The app could not read or save local data. Try again; if it keeps failing, restart the app.',
  },
  DB_MIGRATION_FAILED: {
    title: 'Local data could not be updated.',
    message: 'The update stopped part way and the data may be damaged.',
  },
  DB_NEWER_VERSION: {
    title: 'Local data is from a newer version.',
    message: 'This data was saved by a newer Dreamer Studio. Nothing was changed. Use the newer version.',
  },
};

export function newerVersionNote(found: string, latest: string): string {
  return `Data v${found}, this app supports v${latest}.`;
}

export const errorText = {
  backupNote: 'A copy from before the update is in database.backup.sqlite.',
  code: 'Code',
  openLogs: 'Open logs folder',
  dismiss: 'Dismiss',
  quit: 'Quit',
  reload: 'Reload',
  dialogTitle: 'Dreamer Studio – Unexpected error',
  dataDialogTitle: 'Dreamer Studio – Data error',
  openDataFolder: 'Open data folder',
  file: 'File',
  mainDialogMessage: 'Something went wrong in the app.',
  savedToLogs: 'Details were saved to the logs.',
  logsNotWritable: 'Logs cannot be written to this folder:',
} as const;
