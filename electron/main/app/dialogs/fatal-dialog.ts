import { app, dialog, MessageBoxReturnValue } from 'electron';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { t } from '../app-i18n';
import { openFolder } from '../../ipc/app-ipc';
import { isLoggingReady } from '../../logging/logger';
import { AppPaths } from '../../storage/paths';

type FatalAction = 'openData' | 'openLogs' | 'quit';

interface FatalButton {
  label: string;
  action: FatalAction;
}

function dataButtons(): FatalButton[] {
  return [
    { label: t('common.openDataFolder'), action: 'openData' },
    { label: t('common.openLogs'), action: 'openLogs' },
  ];
}

function fatalButtons(code: ErrorCode): FatalButton[] {
  const quitButton: FatalButton = { label: t('common.quit'), action: 'quit' };
  if (code === ErrorCode.DbOpenFailed || code === ErrorCode.DbMigrationFailed) {
    return [...dataButtons(), quitButton];
  }
  if (code === ErrorCode.DbNewerVersion) {
    return [{ label: t('common.openDataFolder'), action: 'openData' }, quitButton];
  }
  return [quitButton];
}

const warningCodes: ErrorCode[] = [ErrorCode.DbNewerVersion];

export async function showFatalError(code: ErrorCode, file: string, paths: AppPaths, note?: string): Promise<void> {
  const buttons: FatalButton[] = fatalButtons(code);
  const quitIndex: number = buttons.length - 1;
  const noteLine: string = note ? `\n${note}` : '';
  const savedLine: string = isLoggingReady() ? ` ${t('dialog.savedToLogs')}` : '';
  const result: MessageBoxReturnValue = await dialog.showMessageBox({
    type: warningCodes.includes(code) ? 'warning' : 'error',
    title: t('dialog.dataTitle'),
    message: t(`errors.${code}.title`),
    detail: `${t(`errors.${code}.message`)}${noteLine}\n\n${t('common.code')}: ${code}. ${t('common.file')}: ${file}.${savedLine}`,
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
