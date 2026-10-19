import { app, BrowserWindow, dialog, MessageBoxReturnValue, WebContents } from 'electron';
import { AppError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { AppChannel } from '@dreamer/shared/ipc/channels';
import { t } from '../i18n/main-i18n';
import { openFolder } from '../ipc/app-ipc';
import { createLogger, isLoggingReady, Logger } from '../logging/logger';
import { AppPaths } from '../storage/paths';

const logger: Logger = createLogger('error');

let dialogOpen: boolean = false;

async function showDialog(message: string, detail: string, buttons: string[]): Promise<number | null> {
  if (dialogOpen) {
    return null;
  }
  dialogOpen = true;
  try {
    const result: MessageBoxReturnValue = await dialog.showMessageBox({
      type: 'error',
      title: t('dialog.unexpectedTitle'),
      message,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    });
    return result.response;
  } finally {
    dialogOpen = false;
  }
}

async function onUncaughtException(error: Error, paths: AppPaths): Promise<void> {
  if (!isLoggingReady()) {
    dialog.showErrorBox(t('dialog.unexpectedTitle'), errorStack(error));
    app.exit(1);
    return;
  }
  logger.error('Uncaught exception in the main process', error);
  await app.whenReady();
  const detail: string = `${t('common.code')}: ${ErrorCode.MainUnexpected}. ${t('dialog.savedToLogs')}`;
  const choice: number | null = await showDialog(t('dialog.mainMessage'), detail, [
    t('common.openLogs'),
    t('common.quit'),
  ]);
  if (choice === 0) {
    await openFolder(paths.logs);
  }
  app.exit(1);
}

function onUnhandledRejection(reason: unknown): void {
  logger.error('Unhandled promise rejection in the main process', reason);
  const payload: AppError = { code: ErrorCode.MainUnexpected, message: t('errors.MAIN_UNEXPECTED.message') };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AppChannel.Error, payload);
  }
}

async function onRenderProcessGone(contents: WebContents, reason: string, paths: AppPaths): Promise<void> {
  logger.error(`Renderer process gone: ${reason}`);
  const detail: string = `${t('common.code')}: ${ErrorCode.RendererGone} (${reason}).`;
  const choice: number | null = await showDialog(t('errors.RENDERER_GONE.title'), detail, [
    t('common.reload'),
    t('common.openLogs'),
    t('common.quit'),
  ]);
  if (choice === 0) {
    contents.reload();
  } else if (choice === 1) {
    await openFolder(paths.logs);
    app.quit();
  } else if (choice === 2) {
    app.quit();
  }
}

export function installErrorHandlers(paths: AppPaths): void {
  process.on('uncaughtException', (error: Error) => void onUncaughtException(error, paths));
  process.on('unhandledRejection', onUnhandledRejection);
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on(
      'render-process-gone',
      (_goneEvent, details) => void onRenderProcessGone(contents, details.reason, paths),
    );
  });
}

export function reportLogsNotWritable(dir: string): void {
  console.error(`${t('dialog.logsNotWritable')} ${dir}`);
  void app
    .whenReady()
    .then(() => showDialog(t('dialog.unexpectedTitle'), `${t('dialog.logsNotWritable')}\n${dir}`, []));
}

export function reportStartupFailure(error: unknown): void {
  dialog.showErrorBox(t('dialog.unexpectedTitle'), errorStack(error));
  app.exit(1);
}
