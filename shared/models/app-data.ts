export type AppDataContent = 'none' | 'current' | 'older' | 'newer';

export type AppDataStep = 'close' | 'folders' | 'database' | 'backend' | 'rollback';

export interface AppDataCandidate {
  path: string;
  writable: boolean;
  current: boolean;
  content: AppDataContent;
  foundVersion: string | null;
  supportedVersion: string;
}

export interface AppDataStatus {
  path: string;
  freeBytes: number | null;
  writable: boolean;
  schemaVersion: string | null;
  checkedAt: string;
}
