export const AppChannel = {
  Info: 'app:info',
  OpenLogs: 'app:open-logs',
  OpenDataDir: 'app:open-data-dir',
  OpenLink: 'app:open-link',
  Error: 'app:error',
} as const;

export const LogChannel = {
  Write: 'log:write',
} as const;

export const DevChannel = {
  Crash: 'dev:crash',
} as const;

export const BackendChannel = {
  Status: 'backend:status',
  GetStatus: 'backend:get-status',
} as const;

export const SettingsChannel = {
  Get: 'settings:get',
  Update: 'settings:update',
  Reset: 'settings:reset',
  Changed: 'settings:changed',
} as const;

export const AppDataChannel = {
  PickFolder: 'app-data:pick-folder',
  Inspect: 'app-data:inspect',
  Switch: 'app-data:switch',
  Status: 'app-data:status',
  Progress: 'app-data:progress',
  Changed: 'app-data:changed',
} as const;

export const DiagnosticsChannel = {
  Run: 'diagnostics:run',
} as const;

export const LibraryChannel = {
  PickPackage: 'library:pick-package',
  ReadPackage: 'library:read-package',
  PickImage: 'library:pick-image',
  Import: 'library:import',
  Export: 'library:export',
  ShowExport: 'library:show-export',
  List: 'library:list',
  Get: 'library:get',
  GetChapter: 'library:get-chapter',
  Search: 'library:search',
  SearchCancel: 'library:search-cancel',
  SearchProgress: 'library:search-progress',
  UpdateNovel: 'library:update-novel',
  DeleteNovels: 'library:delete-novels',
  OpenFolder: 'library:open-folder',
  Changed: 'library:changed',
} as const;

export const PipelineChannel = {
  Types: 'pipeline:types',
  Start: 'pipeline:start',
  Cancel: 'pipeline:cancel',
  List: 'pipeline:list',
  Get: 'pipeline:get',
  GetLog: 'pipeline:get-log',
  Delete: 'pipeline:delete',
  Update: 'pipeline:update',
  Deleted: 'pipeline:deleted',
  Log: 'pipeline:log',
} as const;
