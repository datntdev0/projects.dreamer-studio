import { CheckOutcome, CheckResult, CheckStatus, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { createLogger, Logger } from '../../logging/logger';
import { CheckContext, SelfCheck } from './self-check';

const logger: Logger = createLogger('diagnostics');

const failedOutcome: CheckOutcome = {
  status: 'error',
  messageKey: 'diagnostics.check.failed',
  fixKey: 'diagnostics.check.failedFix',
};

const timeoutOutcome: CheckOutcome = {
  status: 'error',
  messageKey: 'diagnostics.check.timeout',
  fixKey: 'diagnostics.check.failedFix',
};

const statuses: CheckStatus[] = ['ok', 'warning', 'error'];

function summarize(results: CheckResult[]): string {
  return statuses
    .map(
      (status: CheckStatus) => `${results.filter((result: CheckResult) => result.status === status).length} ${status}`,
    )
    .join(', ');
}

export class SelfCheckEngine {
  private readonly checks: SelfCheck[] = [];
  private running: Promise<DiagnosticsRun> | null = null;

  constructor(
    private readonly context: () => CheckContext,
    private readonly timeoutMs: number = 5000,
  ) {}

  register(check: SelfCheck): void {
    if (this.checks.some((existing: SelfCheck) => existing.id === check.id)) {
      throw new Error(`Self-check already registered: ${check.id}`);
    }
    this.checks.push(check);
  }

  run(): Promise<DiagnosticsRun> {
    this.running ??= this.execute().finally((): void => {
      this.running = null;
    });
    return this.running;
  }

  private async execute(): Promise<DiagnosticsRun> {
    const ctx: CheckContext = this.context();
    const ranAt: string = new Date().toISOString();
    const results: CheckResult[] = await Promise.all(this.checks.map((check: SelfCheck) => this.runCheck(check, ctx)));
    logger.info(`self-checks finished: ${summarize(results)}`);
    return { ranAt, results };
  }

  private async runCheck(check: SelfCheck, ctx: CheckContext): Promise<CheckResult> {
    const started: number = Date.now();
    const outcome: CheckOutcome = await this.outcomeOf(check, ctx);
    return {
      id: check.id,
      category: check.category,
      nameKey: check.nameKey,
      status: outcome.status,
      messageKey: outcome.messageKey,
      fixKey: outcome.fixKey,
      params: outcome.params ?? {},
      durationMs: Date.now() - started,
    };
  }

  private async outcomeOf(check: SelfCheck, ctx: CheckContext): Promise<CheckOutcome> {
    let timer: NodeJS.Timeout | undefined;
    const timeout: Promise<CheckOutcome> = new Promise<CheckOutcome>((resolve) => {
      timer = setTimeout((): void => {
        logger.error(`self-check ${check.id} timed out after ${this.timeoutMs} ms`);
        resolve(timeoutOutcome);
      }, this.timeoutMs);
    });
    const finished: Promise<CheckOutcome> = (async (): Promise<CheckOutcome> => check.run(ctx))().catch(
      (error: unknown): CheckOutcome => {
        logger.error(`self-check ${check.id} failed`, error);
        return failedOutcome;
      },
    );
    try {
      return await Promise.race([finished, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
