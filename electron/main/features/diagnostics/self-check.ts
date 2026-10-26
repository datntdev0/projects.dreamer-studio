import { BackendState } from '@dreamer/shared/ipc/backend';
import { CheckCategory, CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { LlmCliStatus } from '@dreamer/shared/models/llm';
import { AppPaths } from '@storage/paths';
import { SettingsLoadResult } from '../settings/settings-store';

export interface CheckContext {
  paths: AppPaths;
  checkDatabase(): CheckOutcome;
  settings: SettingsLoadResult;
  backend: BackendState;
  pingBackend(): Promise<boolean>;
  llmStatus(): Promise<LlmCliStatus[]>;
}

export interface SelfCheck {
  id: string;
  category: CheckCategory;
  nameKey: string;
  run(ctx: CheckContext): Promise<CheckOutcome>;
}
