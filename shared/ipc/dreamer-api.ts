import { AppInfo } from './app';

export interface DreamerApi {
  app: {
    info(): Promise<AppInfo>;
  };
}

declare global {
  interface Window {
    dreamer: DreamerApi;
  }
}
