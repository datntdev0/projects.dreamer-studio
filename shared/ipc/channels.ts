export const AppChannel = {
  Info: 'app:info',
  OpenLogs: 'app:open-logs',
  OpenDataDir: 'app:open-data-dir',
  Error: 'app:error',
  SetLanguage: 'app:set-language',
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
