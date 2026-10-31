import { BrowserWindow } from 'electron';

export interface Broadcaster {
  send(channel: string, value: unknown): void;
}

export class BroadcastProvider implements Broadcaster {
  send(channel: string, value: unknown): void {
    BrowserWindow.getAllWindows()
      .filter((window: BrowserWindow): boolean => !window.isDestroyed() && !window.webContents.isDestroyed())
      .forEach((window: BrowserWindow): void => window.webContents.send(channel, value));
  }
}
