import { CodedError } from '@dreamer/shared/errors/app-error';
import { LlmUsage } from '@dreamer/shared/models/llm';
import { badOutput, classifyCliError, LlmAdapter, outputObject, parseJson, parseUsage } from '../llm-adapter';

const noToolsLine: string = 'Answer directly from this message. Do not run commands, read files or use any tool.';

export const antigravityAdapter: LlmAdapter = {
  id: 'antigravity',
  versionArgs: ['--version'],
  runCommand({ model, prompt, schemaFile, timeoutMs }): { args: string[]; stdin: string | null } {
    const args: string[] = [
      '--output-format',
      'json',
      '--json-schema',
      schemaFile,
      '--disable-slash-commands',
      '--print-timeout',
      `${Math.ceil(timeoutMs / 1000)}s`,
    ];
    if (model !== null) args.push('--model', model);
    args.push(
      '-p',
      `${noToolsLine}

${prompt}`,
    );
    return { args, stdin: null };
  },
  parseOutput(stdout): { value: unknown; usage: LlmUsage | null } {
    const envelope: Record<string, unknown> = outputObject(parseJson(stdout));
    if (envelope.status === 'ERROR') {
      const reason: string = String(envelope.error ?? envelope.response ?? 'Antigravity failed');
      throw new CodedError(classifyCliError(0, reason, ''), reason);
    }
    if (envelope.status !== 'SUCCESS' || !Object.hasOwn(envelope, 'structured_output')) {
      throw badOutput('Antigravity omitted structured_output');
    }
    return { value: envelope.structured_output, usage: parseUsage(envelope.usage) };
  },
  classifyError: classifyCliError,
};
