import { CodedError } from '@dreamer/shared/errors/app-error';
import { LlmUsage } from '@dreamer/shared/models/llm';
import { badOutput, classifyCliError, LlmAdapter, outputObject, parseJson, parseUsage } from '../llm-adapter';

export const claudeAdapter: LlmAdapter = {
  id: 'claude',
  versionArgs: ['--version'],
  runCommand({ model, prompt, schema }): { args: string[]; stdin: string | null } {
    const args: string[] = [
      '-p',
      '--output-format',
      'json',
      '--tools',
      '',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--json-schema',
      JSON.stringify(schema),
    ];
    if (model !== null) args.push('--model', model);
    return { args, stdin: prompt };
  },
  parseOutput(stdout): { value: unknown; usage: LlmUsage | null } {
    const envelope: Record<string, unknown> = outputObject(parseJson(stdout));
    if (envelope.is_error === true || envelope.subtype !== 'success') {
      const reason: string = String(envelope.result ?? envelope.error ?? 'Claude failed');
      throw new CodedError(classifyCliError(0, reason, ''), reason);
    }
    if (!Object.hasOwn(envelope, 'structured_output')) throw badOutput('Claude omitted structured_output');
    return { value: envelope.structured_output, usage: parseUsage(envelope.usage) };
  },
  classifyError: classifyCliError,
};
