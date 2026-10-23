import { BrowserWindow, dialog, MessageBoxReturnValue, OpenDialogReturnValue, OpenDialogOptions } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { t } from '../app-i18n';
import { SettingsStore } from '../../features/settings/settings-store';
import { probeWritable } from '@storage/folder-probe';

type AppDataAction = 'choose' | 'useDefault' | 'quit';

interface AppDataButton {
  label: string;
  action: AppDataAction;
}

async function askAppDataAction(folder: string, canUseDefault: boolean): Promise<AppDataAction> {
  const buttons: AppDataButton[] = [{ label: t('dialog.appData.choose'), action: 'choose' }];
  if (canUseDefault) {
    buttons.push({ label: t('dialog.appData.useDefault'), action: 'useDefault' });
  }
  buttons.push({ label: t('common.quit'), action: 'quit' });
  const problem: string = t(existsSync(folder) ? 'dialog.appData.notWritable' : 'dialog.appData.missing', {
    path: folder,
  });
  const result: MessageBoxReturnValue = await dialog.showMessageBox({
    type: 'warning',
    title: t('dialog.appData.title'),
    message: t('dialog.appData.message'),
    detail: `${problem}\n\n${t(canUseDefault ? 'dialog.appData.choice' : 'dialog.appData.choiceNoDefault')}`,
    buttons: buttons.map((button: AppDataButton) => button.label),
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });
  return buttons[result.response].action;
}

export async function pickFolder(parent?: BrowserWindow | null, defaultPath?: string): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: t('settings.storage.picker.title'),
    buttonLabel: t('settings.storage.picker.select'),
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  };
  const result: OpenDialogReturnValue = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
}

function isUsable(folder: string, defaultRoot: string): boolean {
  if (folder === defaultRoot) {
    try {
      mkdirSync(defaultRoot, { recursive: true });
    } catch {
      return false;
    }
  }
  return probeWritable(folder);
}

export async function resolveAppDataRoot(settings: SettingsStore, defaultRoot: string): Promise<string | null> {
  let folder: string = settings.get().appDataDir;
  while (true) {
    if (isUsable(folder, defaultRoot)) {
      if (folder !== settings.get().appDataDir) {
        settings.setAppDataDir(folder);
      }
      return folder;
    }
    const action: AppDataAction = await askAppDataAction(folder, folder !== defaultRoot);
    if (action === 'quit') {
      return null;
    }
    if (action === 'useDefault') {
      folder = defaultRoot;
    } else {
      folder = (await pickFolder()) ?? folder;
    }
  }
}
