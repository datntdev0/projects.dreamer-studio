import { CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { LLM_CLIS, LlmCliStatus } from '@dreamer/shared/models/llm';
import { CheckContext } from '../diagnostics/self-check';
import { SelfCheckEngine } from '../diagnostics/self-check-engine';

async function checkClis(ctx: CheckContext): Promise<CheckOutcome> {
  const statuses: LlmCliStatus[] = await ctx.llmStatus();
  const installed: LlmCliStatus[] = statuses.filter((status: LlmCliStatus): boolean => status.state === 'installed');
  if (installed.length > 0) {
    return {
      status: 'ok',
      messageKey: 'diagnostics.check.llm.cli.ok',
      fixKey: null,
      params: {
        count: installed.length,
        names: installed.map((status: LlmCliStatus): string => LLM_CLIS[status.id].name).join(', '),
      },
    };
  }
  return {
    status: 'warning',
    messageKey: 'diagnostics.check.llm.cli.warning',
    fixKey: 'diagnostics.check.llm.cli.fix',
  };
}

export function registerLlmChecks(engine: SelfCheckEngine): void {
  engine.register({
    id: 'llm.cli',
    category: 'llm',
    nameKey: 'diagnostics.check.llm.cli.name',
    run: checkClis,
  });
}
