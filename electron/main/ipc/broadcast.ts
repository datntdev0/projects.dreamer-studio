import { BrowserWindow } from 'electron';

export function broadcast(channel: string, value: unknown): void {
  BrowserWindow.getAllWindows()
    .filter((window: BrowserWindow): boolean => !window.isDestroyed() && !window.webContents.isDestroyed())
    .forEach((window: BrowserWindow): void => window.webContents.send(channel, value));
}
