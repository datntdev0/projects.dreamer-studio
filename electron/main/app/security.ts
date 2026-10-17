import { BrowserWindow } from 'electron';

export function secureWindow(window: BrowserWindow, allowedOrigin: string): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url: string) => {
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault();
    }
  });
}
