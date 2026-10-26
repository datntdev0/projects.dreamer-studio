import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { isModelId, LlmRunRequest, LlmRunResult, LlmUsage } from '@dreamer/shared/models/llm';
import { createLogger, Logger } from '../../logging/logger';
import { LlmAdapter } from './llm-adapter';
import { spawnCli, SpawnCliResult } from './llm-process';

export interface RunLlmInput {
  adapter: LlmAdapter;
  path: string;
  request: LlmRunRequest;
  cacheDir: string;
  signal?: AbortSignal;
  log?: Logger;
  promptFile?: string;
}

const logger: Logger = createLogger('llm');

async function writePromptPart(file: string, content: string, append: boolean, log: Logger): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    if (append) await appendFile(file, content, 'utf8');
    else await writeFile(file, content, 'utf8');
  } catch (error) {
    log.warn(`could not write prompt log ${file}: ${errorMessage(error)}`);
  }
}

export async function runLlm({
  adapter,
  path,
  request,
  cacheDir,
  signal,
  log = logger,
  promptFile,
}: RunLlmInput): Promise<LlmRunResult> {
  if (request.model !== null && !isModelId(request.model)) {
    throw new CodedError(ErrorCode.LlmCliFailed, 'Invalid model id', 'model');
  }
  if (adapter.id === 'antigravity' && /\.(cmd|bat)$/i.test(path)) {
    throw new CodedError(ErrorCode.LlmCliFailed, 'Antigravity requires a native executable');
  }
  const workDir: string = join(cacheDir, randomUUID());
  const started: number = Date.now();
  let stdout: string = '';
  let stderr: string = '';
  log.info(
    `${adapter.id} run started: promptBytes=${Buffer.byteLength(request.prompt)}, model=${request.model ?? 'default'}`,
  );
  try {
    if (promptFile) {
      const name: string = basename(promptFile, '.md').replace(/^\d{3}-/, '');
      const header: string = `# ${name}\n\nCLI: ${adapter.id}\nModel: ${request.model ?? 'default'}\nTime: ${new Date(started).toISOString()}\n\n## Prompt\n\n${request.prompt}\n\n`;
      await writePromptPart(promptFile, header, false, log);
    }
    await mkdir(workDir, { recursive: true });
    const schemaFile: string = join(workDir, 'schema.json');
    await writeFile(schemaFile, JSON.stringify(request.schema), 'utf8');
    const command: { args: string[]; stdin: string | null } = adapter.runCommand({
      model: request.model,
      prompt: request.prompt,
      schema: request.schema,
      schemaFile,
      timeoutMs: request.timeoutMs,
    });
    const result: SpawnCliResult = await spawnCli({
      path,
      args: command.args,
      stdin: command.stdin,
      cwd: workDir,
      timeoutMs: request.timeoutMs,
      signal,
    });
    stdout = result.stdout;
    stderr = result.stderr;
    if (result.timedOut) {
      throw new CodedError(ErrorCode.LlmTimeout, 'LLM CLI timed out', String(request.timeoutMs / 1000));
    }
    if (result.exitCode !== 0) {
      throw new CodedError(
        adapter.classifyError(result.exitCode, stdout, stderr),
        'LLM CLI failed',
        String(result.exitCode),
      );
    }
    const parsed: { value: unknown; usage: LlmUsage | null } = adapter.parseOutput(stdout);
    const validate: ValidateFunction = new Ajv().compile(request.schema);
    if (!validate(parsed.value)) {
      const path: string =
        (validate.errors as ErrorObject[] | null)?.map((error: ErrorObject) => error.instancePath || '/').join(', ') ??
        '/';
      log.warn(`${adapter.id} answer failed schema at ${path}`);
      throw new CodedError(ErrorCode.LlmBadOutput, 'LLM answer failed schema');
    }
    const durationMs: number = Date.now() - started;
    log.info(
      `${adapter.id} run complete: durationMs=${durationMs}, inputTokens=${parsed.usage?.inputTokens ?? 'unknown'}, outputTokens=${parsed.usage?.outputTokens ?? 'unknown'}`,
    );
    if (promptFile)
      await writePromptPart(
        promptFile,
        `## Answer\n\n\`\`\`json\n${JSON.stringify(parsed.value, null, 2)}\n\`\`\`\n`,
        true,
        log,
      );
    return { value: parsed.value, usage: parsed.usage, durationMs };
  } catch (error) {
    if (promptFile) {
      const code: string = error instanceof CodedError ? error.code : 'unknown';
      const stdoutHead: string = Buffer.from(stdout).subarray(0, 2048).toString('utf8');
      await writePromptPart(
        promptFile,
        `## Error\n\nCode: ${code}\nMessage: ${errorMessage(error)}\n\n### Stdout head\n\n\`\`\`text\n${stdoutHead}\n\`\`\`\n\n### Stderr tail\n\n\`\`\`text\n${stderr.slice(-2048)}\n\`\`\`\n`,
        true,
        log,
      );
    }
    if (error instanceof CodedError && error.code === ErrorCode.LlmBadOutput) {
      log.warn(`${adapter.id} answer head: ${stdout.slice(0, 2048)}`);
    }
    log.warn(
      `${adapter.id} run failed: code=${error instanceof CodedError ? error.code : 'unknown'}, durationMs=${Date.now() - started}, stderrTail=${stderr.slice(-2048)}`,
    );
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
