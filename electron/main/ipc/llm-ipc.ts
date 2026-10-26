import { BrowserWindow, dialog, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import { LlmChannel } from '@dreamer/shared/ipc/channels';
import { LLM_CLIS, isLlmCliId, isLlmPathRequest } from '@dreamer/shared/models/llm';
import { LlmCliId, LlmCliStatus, LlmPathRequest, LlmTestResult } from '@dreamer/shared/models/llm';
import { t } from '../app/app-i18n';
import { LlmService } from '../features/llm/llm-service';
import { broadcast } from './broadcast';
import { handle, handleValidated } from './handle';

async function pickPath(cli: LlmCliId, event: IpcMainInvokeEvent): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: t('settings.llm.providers.dialog.title', { name: LLM_CLIS[cli].name }),
    properties: ['openFile'],
  };
  if (process.platform === 'win32') {
    options.filters = [{ name: 'Executables', extensions: ['exe', 'cmd'] }];
  }
  const parent: BrowserWindow | null = BrowserWindow.getFocusedWindow() ?? BrowserWindow.fromWebContents(event.sender);
  const result: OpenDialogReturnValue = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

export function registerLlmIpc(service: LlmService): void {
  handle(LlmChannel.Status, (): Promise<LlmCliStatus[]> => service.status());
  handle(LlmChannel.Detect, (): Promise<LlmCliStatus[]> => service.detect());
  handleValidated(LlmChannel.Test, isLlmCliId, (cli: LlmCliId): Promise<LlmTestResult> => service.test(cli));
  handleValidated(LlmChannel.PickPath, isLlmCliId, pickPath);
  handleValidated(LlmChannel.SetPath, isLlmPathRequest, (request: LlmPathRequest): Promise<LlmCliStatus> =>
    service.setPath(request),
  );
  service.onChanged((statuses: LlmCliStatus[]): void => broadcast(LlmChannel.Changed, statuses));
}
