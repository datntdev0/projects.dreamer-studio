import { app, dialog, MessageBoxReturnValue } from 'electron';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { ErrorCopy, errorCopy, errorText } from '@dreamer/shared/errors/error-copy';
import { openFolder } from '../ipc/app-ipc';
import { AppPaths } from '../storage/paths';

type FatalAction = 'openData' | 'openLogs' | 'quit';

interface FatalButton {
  label: string;
  action: FatalAction;
}

const quitButton: FatalButton = { label: errorText.quit, action: 'quit' };

const fatalButtons: Partial<Record<ErrorCode, FatalButton[]>> = {
  DB_OPEN_FAILED: [
    { label: errorText.openDataFolder, action: 'openData' },
    { label: errorText.openLogs, action: 'openLogs' },
  ],
};

export async function showFatalError(code: ErrorCode, file: string, paths: AppPaths): Promise<void> {
  const buttons: FatalButton[] = [...(fatalButtons[code] ?? []), quitButton];
  const quitIndex: number = buttons.length - 1;
  const copy: ErrorCopy = errorCopy[code];
  const result: MessageBoxReturnValue = await dialog.showMessageBox({
    type: 'error',
    title: errorText.dataDialogTitle,
    message: copy.title,
    detail: `${copy.message}\n\n${errorText.code}: ${code}. ${errorText.file}: ${file}. ${errorText.savedToLogs}`,
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
