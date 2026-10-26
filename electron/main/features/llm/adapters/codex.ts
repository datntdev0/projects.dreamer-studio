import { CodedError } from '@dreamer/shared/errors/app-error';
import { LlmUsage } from '@dreamer/shared/models/llm';
import { badOutput, classifyCliError, LlmAdapter, outputObject, parseJson, parseUsage } from '../llm-adapter';

export const codexAdapter: LlmAdapter = {
  id: 'codex',
  versionArgs: ['--version'],
  runCommand({ model, prompt, schemaFile }): { args: string[]; stdin: string | null } {
    const args: string[] = [
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--output-schema',
      schemaFile,
    ];
    if (model !== null) args.push('-m', model);
    args.push('-');
    return { args, stdin: prompt };
  },
  parseOutput(stdout): { value: unknown; usage: LlmUsage | null } {
    let answer: string | null = null;
    let usage: LlmUsage | null = null;
    let failure: string | null = null;
    let turnFailed: boolean = false;
    for (const line of stdout.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      const event: Record<string, unknown> = outputObject(parseJson(line));
      if (event.type === 'item.completed') {
        const item: Record<string, unknown> = outputObject(event.item);
        if (item.type === 'agent_message' && typeof item.text === 'string') answer = item.text;
      }
      if (event.type === 'turn.completed') usage = parseUsage(event.usage);
      if (event.type === 'turn.failed') {
        turnFailed = true;
        failure = JSON.stringify(event.error ?? event);
      }
      if (event.type === 'error' && answer === null) failure = JSON.stringify(event.message ?? event);
    }
    if (failure !== null && (turnFailed || answer === null)) {
      throw new CodedError(classifyCliError(0, failure, ''), failure);
    }
    if (answer === null) throw badOutput('Codex omitted agent_message');
    return { value: parseJson(answer), usage };
  },
  classifyError: classifyCliError,
};
