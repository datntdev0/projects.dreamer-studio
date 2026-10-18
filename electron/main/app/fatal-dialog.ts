import { app, dialog, MessageBoxReturnValue } from 'electron';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { ErrorCopy, errorCopy, errorText } from '@dreamer/shared/errors/error-copy';
import { openFolder } from '../ipc/app-ipc';
import { isLoggingReady } from '../logging/logger';
import { AppPaths } from '../storage/paths';

type FatalAction = 'openData' | 'openLogs' | 'quit';

interface FatalButton {
  label: string;
  action: FatalAction;
}

const quitButton: FatalButton = { label: errorText.quit, action: 'quit' };

const dataButtons: FatalButton[] = [
  { label: errorText.openDataFolder, action: 'openData' },
  { label: errorText.openLogs, action: 'openLogs' },
];

const fatalButtons: Partial<Record<ErrorCode, FatalButton[]>> = {
  DB_OPEN_FAILED: dataButtons,
  DB_MIGRATION_FAILED: dataButtons,
  DB_NEWER_VERSION: [{ label: errorText.openDataFolder, action: 'openData' }],
};

const warningCodes: ErrorCode[] = [ErrorCode.DbNewerVersion];

export async function showFatalError(code: ErrorCode, file: string, paths: AppPaths, note?: string): Promise<void> {
  const buttons: FatalButton[] = [...(fatalButtons[code] ?? []), quitButton];
  const quitIndex: number = buttons.length - 1;
  const copy: ErrorCopy = errorCopy[code];
  const noteLine: string = note ? `\n${note}` : '';
  const savedLine: string = isLoggingReady() ? ` ${errorText.savedToLogs}` : '';
  const result: MessageBoxReturnValue = await dialog.showMessageBox({
    type: warningCodes.includes(code) ? 'warning' : 'error',
    title: errorText.dataDialogTitle,
    message: copy.title,
    detail: `${copy.message}${noteLine}\n\n${errorText.code}: ${code}. ${errorText.file}: ${file}.${savedLine}`,
    buttons: buttons.map((button: FatalButton) => button.label),
    defaultId: quitIndex,
    cancelId: quitIndex,
    noLink: true,
  });
  const action: FatalAction = buttons[result.response].action;
  if (action === 'openData') {
    await openFolder(paths.root);
  } else if (action === 'openLogs') {
    await openFolder(paths.logs);
  }
  app.exit(1);
}
