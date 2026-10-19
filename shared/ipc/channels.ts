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
