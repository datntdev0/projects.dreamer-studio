import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';
import { Theme } from '@dreamer/shared/models/settings';
import { appOrigin } from './protocol';
import { secureWindow } from './security';

const BACKGROUND_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#101211' };

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'resources', 'icon.ico');
}

export function createWindow(theme: Theme): BrowserWindow {
  Menu.setApplicationMenu(null);
  const window: BrowserWindow = new BrowserWindow({
    title: 'Dreamer Studio',
    icon: iconPath(),
    minWidth: 1280,
    minHeight: 720,
    show: false,
    backgroundColor: BACKGROUND_COLORS[theme],
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const devUrl: string | undefined = process.env.DREAMER_DEV_URL;
  secureWindow(window, devUrl ? new URL(devUrl).origin : appOrigin);
  window.once('ready-to-show', () => window.show());
  void window.loadURL(devUrl ?? `${appOrigin}/index.html`);
  return window;
}

export function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}
