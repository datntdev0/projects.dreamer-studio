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

export const LlmChannel = {
  Status: 'llm:status',
  Detect: 'llm:detect',
  Test: 'llm:test',
  PickPath: 'llm:pick-path',
  SetPath: 'llm:set-path',
  Changed: 'llm:changed',
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
  ChangeChapters: 'library:change-chapters',
  DeleteNovels: 'library:delete-novels',
  OpenFolder: 'library:open-folder',
  Changed: 'library:changed',
} as const;

export const AnalysisChannel = {
  Status: 'analysis:status',
  Chapter: 'analysis:chapter',
  Plan: 'analysis:plan',
  Start: 'analysis:start',
  Cancel: 'analysis:cancel',
  World: 'analysis:world',
  Review: 'analysis:review',
  Occurrences: 'analysis:occurrences',
  Edit: 'analysis:edit',
  Scope: 'analysis:scope',
  Preview: 'analysis:preview',
  FindQuote: 'analysis:find-quote',
  OntologyOpen: 'analysis:ontology-open',
  OntologyReset: 'analysis:ontology-reset',
  OntologyCheck: 'analysis:ontology-check',
  Progress: 'analysis:progress',
  Changed: 'analysis:changed',
} as const;

export const TranslationChannel = {
  Status: 'translation:status',
  Chapter: 'translation:chapter',
  Glossary: 'translation:glossary',
  EditGlossary: 'translation:edit-glossary',
  Instruction: 'translation:instruction',
  SaveInstruction: 'translation:save-instruction',
  ResetInstruction: 'translation:reset-instruction',
  PlanGlossary: 'translation:plan-glossary',
  StartGlossary: 'translation:start-glossary',
  PlanContent: 'translation:plan-content',
  StartContent: 'translation:start-content',
  Cancel: 'translation:cancel',
  Save: 'translation:save',
  Progress: 'translation:progress',
  Changed: 'translation:changed',
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
