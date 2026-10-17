export const AppChannel = {
  Info: 'app:info',
  OpenLogs: 'app:open-logs',
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
} as const;
