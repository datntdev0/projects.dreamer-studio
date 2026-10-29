import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { LlmFeatureRunRequest, LlmRunResult } from '@dreamer/shared/models/llm';
import type { Logger } from '../../logging/logger';

export type AskLlm = (request: LlmFeatureRunRequest, name: string) => Promise<LlmRunResult>;

function retryPrompt(prompt: string, problems: string[]): string {
  return `${prompt}\n\n## Your previous answer had these problems\n${problems.map((problem: string): string => `- ${problem}`).join('\n')}\nReturn the full corrected answer.`;
}

export async function askChecked<TOutput, TResult>(input: {
  label: string;
  slug: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  failureCode: ErrorCode;
  ask: AskLlm;
  log: Logger;
  check: (output: TOutput) => { result: TResult; errors: string[] };
}): Promise<TResult> {
  let lastResult: TResult | undefined;
  let problems: string[] = [];
  for (let attempt: number = 1; attempt <= 3; attempt++) {
    const prompt: string = attempt === 1 ? input.prompt : retryPrompt(input.prompt, problems);
    let answer: LlmRunResult;
    try {
      answer = await input.ask(
        { prompt, schema: input.schema, timeoutMs: input.timeoutMs },
        `${input.slug}-a${attempt}`,
      );
    } catch (error) {
      if (!(error instanceof CodedError) || error.code !== ErrorCode.LlmBadOutput) throw error;
      input.log.warn(`${input.label} attempt ${attempt}/3: invalid JSON`);
      problems = ['Your previous answer was not valid JSON for the schema.'];
      continue;
    }
    const checked: { result: TResult; errors: string[] } = input.check(answer.value as TOutput);
    lastResult = checked.result;
    input.log.info(`${input.label} attempt ${attempt}/3: ${checked.errors.length} rule errors`);
    checked.errors.slice(0, 5).forEach((error: string): void => input.log.info(`  ${error}`));
    if (checked.errors.length === 0) return checked.result;
    problems = checked.errors;
  }
  if (lastResult !== undefined) return lastResult;
  throw new CodedError(input.failureCode, `${input.label}: no valid LLM answer after 3 attempts`);
}
