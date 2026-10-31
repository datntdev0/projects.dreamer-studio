import { app, dialog, MessageBoxReturnValue, WebContents } from 'electron';
import { AppError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { AppChannel } from '@dreamer/shared/ipc/channels';
import { I18nProvider } from './i18n-provider';
import { LogProvider } from '../logging/log-provider';
import { Broadcaster } from '../ipc/broadcast-provider';
import { openFolder } from '../ipc/app-controller';
import { Logger } from '../logging/logger';
import { AppPaths } from '@storage/paths';

export class ErrorProvider {
  private readonly logger: Logger;
  private dialogOpen: boolean = false;

  constructor(
    private readonly i18n: I18nProvider,
    private readonly logging: LogProvider,
    private readonly broadcaster: Broadcaster,
  ) {
    this.logger = logging.createLogger('error');
  }

  private async showDialog(message: string, detail: string, buttons: string[]): Promise<number | null> {
    if (this.dialogOpen) {
      return null;
    }
    this.dialogOpen = true;
    try {
      const result: MessageBoxReturnValue = await dialog.showMessageBox({
        type: 'error',
        title: this.i18n.t('dialog.unexpectedTitle'),
        message,
        detail,
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
        noLink: true,
      });
      return result.response;
    } finally {
      this.dialogOpen = false;
    }
  }

  private async onUncaughtException(error: Error, paths: () => AppPaths): Promise<void> {
    if (!this.logging.isLoggingReady()) {
      dialog.showErrorBox(this.i18n.t('dialog.unexpectedTitle'), errorStack(error));
      app.exit(1);
      return;
    }
    this.logger.error('Uncaught exception in the main process', error);
    await app.whenReady();
    const detail: string = `${this.i18n.t('common.code')}: ${ErrorCode.MainUnexpected}. ${this.i18n.t('dialog.savedToLogs')}`;
    const choice: number | null = await this.showDialog(this.i18n.t('dialog.mainMessage'), detail, [
      this.i18n.t('common.openLogs'),
      this.i18n.t('common.quit'),
    ]);
    if (choice === 0) {
      await openFolder(paths().logs);
    }
    app.exit(1);
  }

  private onUnhandledRejection(reason: unknown): void {
    this.logger.error('Unhandled promise rejection in the main process', reason);
    const payload: AppError = {
      code: ErrorCode.MainUnexpected,
      message: this.i18n.t('errors.MAIN_UNEXPECTED.message'),
    };
    this.broadcaster.send(AppChannel.Error, payload);
  }

  private async onRenderProcessGone(contents: WebContents, reason: string, paths: () => AppPaths): Promise<void> {
    this.logger.error(`Renderer process gone: ${reason}`);
    const detail: string = `${this.i18n.t('common.code')}: ${ErrorCode.RendererGone} (${reason}).`;
    const choice: number | null = await this.showDialog(this.i18n.t('errors.RENDERER_GONE.title'), detail, [
      this.i18n.t('common.reload'),
      this.i18n.t('common.openLogs'),
      this.i18n.t('common.quit'),
    ]);
    if (choice === 0) {
      contents.reload();
    } else if (choice === 1) {
      await openFolder(paths().logs);
      app.quit();
    } else if (choice === 2) {
      app.quit();
    }
  }

  install(paths: () => AppPaths): void {
    process.on('uncaughtException', (error: Error) => void this.onUncaughtException(error, paths));
    process.on('unhandledRejection', (reason: unknown): void => this.onUnhandledRejection(reason));
    app.on('web-contents-created', (_event, contents: WebContents) => {
      contents.on(
        'render-process-gone',
        (_goneEvent, details) => void this.onRenderProcessGone(contents, details.reason, paths),
      );
    });
  }

  reportLogsNotWritable(dir: string): void {
    console.error(`${this.i18n.t('dialog.logsNotWritable')} ${dir}`);
    void app
      .whenReady()
      .then(() =>
        this.showDialog(this.i18n.t('dialog.unexpectedTitle'), `${this.i18n.t('dialog.logsNotWritable')}\n${dir}`, []),
      );
  }

  reportStartupFailure(error: unknown): void {
    dialog.showErrorBox(this.i18n.t('dialog.unexpectedTitle'), errorStack(error));
    app.exit(1);
  }
}
