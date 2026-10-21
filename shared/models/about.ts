import { AppInfo } from '../ipc/app';
import { BackendState, BackendStatus } from '../ipc/backend';

export type AboutLink = 'repository' | 'issues';

export const APP_NAME = 'Dreamer Studio';
export const APP_LICENSE = 'MIT';
export const DEV_BUILD_TAG = 'dev';
export const MISSING = '—';
export const REPOSITORY_URL = 'https://github.com/datntdev0/projects.dreamer-studio';
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

export const ABOUT_LINKS: Record<AboutLink, string> = { repository: REPOSITORY_URL, issues: ISSUES_URL };

const BACKEND_TEXT: Record<BackendState, string> = {
  running: 'Running',
  starting: 'Starting',
  unavailable: 'Not running',
};

export function isAboutLink(value: unknown): value is AboutLink {
  return typeof value === 'string' && Object.hasOwn(ABOUT_LINKS, value);
}

export function versionLabel(info: AppInfo): string {
  return info.buildDate ? info.version : `${info.version} ${DEV_BUILD_TAG}`;
}

export function backendText(backend: BackendStatus): string {
  const text: string = BACKEND_TEXT[backend.state];
  return backend.state === 'running' && backend.address ? `${text} · ${backend.address}` : text;
}

export function buildDateLabel(info: AppInfo): string {
  return info.buildDate ?? DEV_BUILD_TAG;
}

export function formatVersionInfo(info: AppInfo | null, backend: BackendStatus): string {
  return [
    `${APP_NAME} ${info ? versionLabel(info) : MISSING}`,
    `Build date: ${info ? buildDateLabel(info) : MISSING}`,
    `Electron: ${info?.electron ?? MISSING}`,
    `Chromium: ${info?.chrome ?? MISSING}`,
    `Node.js: ${info?.node ?? MISSING}`,
    `OS: ${info?.os ?? MISSING}`,
    `Database schema: ${info?.schemaVersion ?? MISSING}`,
    `AI backend: ${backendText(backend)}`,
  ].join('\n');
}
