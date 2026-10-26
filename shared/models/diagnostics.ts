export type CheckStatus = 'ok' | 'warning' | 'error';

export type CheckCategory = 'storage' | 'database' | 'backend' | 'llm' | 'settings';

export const CHECK_CATEGORIES: CheckCategory[] = ['storage', 'database', 'backend', 'llm', 'settings'];

export type CheckParams = Record<string, string | number>;

export interface CheckOutcome {
  status: CheckStatus;
  messageKey: string;
  fixKey: string | null;
  params?: CheckParams;
}

export interface CheckResult {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  nameKey: string;
  messageKey: string;
  fixKey: string | null;
  params: CheckParams;
  durationMs: number;
}

export interface DiagnosticsRun {
  ranAt: string;
  results: CheckResult[];
}
