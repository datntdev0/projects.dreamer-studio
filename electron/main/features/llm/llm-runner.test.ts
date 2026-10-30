import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { LlmRunRequest, LlmUsage } from '@dreamer/shared/models/llm';
import { classifyCliError, LlmAdapter, outputObject, parseJson, parseUsage } from './llm-adapter';
import { runLlm } from './llm-runner';

const fakeScript: string = [
  "const fs = require('node:fs');",
  "const { spawn } = require('node:child_process');",
  'const mode = process.env.DREAMER_FAKE_MODE;',
  "if (mode === 'sleep') {",
  "  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });",
  '  fs.writeFileSync(process.env.DREAMER_FAKE_PID_FILE, JSON.stringify({ parent: process.pid, child: child.pid }));',
  '  setTimeout(() => {}, 30000);',
  "} else if (mode === 'signed-out') {",
  "  process.stderr.write('not logged in');",
  '  process.exitCode = 1;',
  "} else if (mode === 'bad-json') {",
  "  process.stdout.write('not json');",
  "} else if (mode === 'bad-schema') {",
  "  process.stdout.write(JSON.stringify({ value: { ok: 'no' } }));",
  '} else {',
  '  process.stdout.write(JSON.stringify({ value: { ok: true }, usage: { input_tokens: 3, output_tokens: 2 } }));',
  '}',
].join('\n');

const adapter: LlmAdapter = {
  id: 'claude',
  versionArgs: ['--version'],
  runCommand({ prompt }): { args: string[]; stdin: string | null } {
    return { args: [], stdin: prompt };
  },
  parseOutput(stdout): { value: unknown; usage: LlmUsage | null } {
    const envelope: Record<string, unknown> = outputObject(parseJson(stdout));
    return { value: envelope.value, usage: parseUsage(envelope.usage) };
  },
  classifyError: classifyCliError,
};

const log = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};
let testDir: string;
let launcher: string;
let cacheDir: string;
let pidFile: string;

function request(timeoutMs: number = 5000): LlmRunRequest {
  return {
    cli: 'claude',
    model: null,
    prompt: 'Reply with JSON',
    schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false },
    timeoutMs,
  };
}

async function run(timeoutMs?: number, signal?: AbortSignal): Promise<unknown> {
  return runLlm({ adapter, path: launcher, request: request(timeoutMs), cacheDir, signal, log });
}

async function expectClean(): Promise<void> {
  expect(await readdir(cacheDir)).toEqual([]);
}

async function waitForExit(pid: number): Promise<void> {
  for (let attempt: number = 0; attempt < 30; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Fake CLI child ${pid} is still running`);
}

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'dreamer-llm-runner-'));
  cacheDir = join(testDir, 'cache');
  pidFile = join(testDir, 'child.pid');
  const script: string = join(testDir, 'fake-cli.cjs');
  await writeFile(script, fakeScript, 'utf8');
  if (process.platform === 'win32') {
    launcher = join(testDir, 'fake-cli.cmd');
    await writeFile(launcher, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`, 'utf8');
  } else {
    launcher = join(testDir, 'fake-cli');
    await writeFile(launcher, `#!/usr/bin/env node\n${fakeScript}\n`, 'utf8');
    await chmod(launcher, 0o755);
  }
  vi.stubEnv('DREAMER_FAKE_PID_FILE', pidFile);
});

afterEach(async () => {
  vi.stubEnv('DREAMER_FAKE_MODE', undefined);
  await expectClean();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(testDir, { recursive: true, force: true });
});

describe('[TH02-03] runLlm with a fake CLI', () => {
  it('returns a checked answer and usage, then removes the run folder', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'ok');
    await expect(run()).resolves.toMatchObject({ value: { ok: true }, usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it.each(['bad-json', 'bad-schema'])('rejects %s as bad output', async (mode: string) => {
    vi.stubEnv('DREAMER_FAKE_MODE', mode);
    await expect(run()).rejects.toMatchObject({ code: ErrorCode.LlmBadOutput });
  });

  it('kills the process tree after timeout', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'sleep');
    await expect(run(1000)).rejects.toMatchObject({ code: ErrorCode.LlmTimeout });
    await waitForExit(JSON.parse(await readFile(pidFile, 'utf8')).child);
  }, 10000);

  it('kills the process tree on abort', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'sleep');
    const controller: AbortController = new AbortController();
    const pending: Promise<unknown> = run(5000, controller.signal);
    setTimeout(() => controller.abort(), 500);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await waitForExit(JSON.parse(await readFile(pidFile, 'utf8')).child);
  }, 10000);

  it('classifies a signed-out CLI', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'signed-out');
    await expect(run()).rejects.toMatchObject({ code: ErrorCode.LlmNotSignedIn });
  });
});

describe('[TH02-03] runLlm prompt file', () => {
  const warn = vi.fn();
  const logged = { ...log, warn };

  function runWithFile(promptFile: string): Promise<unknown> {
    return runLlm({ adapter, path: launcher, request: request(), cacheDir, log: logged, promptFile });
  }

  it('writes the header, prompt and answer', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'ok');
    const file: string = join(testDir, 'prompts', 'run', '001-candidates-ch001-003-a1.md');
    await runWithFile(file);
    const text: string = await readFile(file, 'utf8');
    expect(text).toContain('# candidates-ch001-003-a1');
    expect(text).toContain('CLI: claude');
    expect(text).toContain('Model: default');
    expect(text).toMatch(/Time: \d{4}-\d{2}-\d{2}T/);
    expect(text).toContain('## Prompt\n\nReply with JSON');
    expect(text).toContain('## Answer');
    expect(text).toContain('"ok": true');
    expect(text).not.toContain('## Error');
  });

  it('writes the error code, message and stdout head when the answer is bad', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'bad-json');
    const file: string = join(testDir, 'prompts', 'run', '002-predicates-ch001-a2.md');
    await expect(runWithFile(file)).rejects.toMatchObject({ code: ErrorCode.LlmBadOutput });
    const text: string = await readFile(file, 'utf8');
    expect(text).toContain('## Prompt');
    expect(text).toContain(`Code: ${ErrorCode.LlmBadOutput}`);
    expect(text).toContain('Message: ');
    expect(text).toContain('### Stdout head');
    expect(text).toContain('not json');
    expect(text).not.toContain('## Answer');
  });

  it('only warns when the prompt file cannot be written', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'ok');
    const blocker: string = join(testDir, 'blocker');
    await writeFile(blocker, 'a file, not a folder', 'utf8');
    warn.mockClear();
    await expect(runWithFile(join(blocker, '001-x-a1.md'))).resolves.toMatchObject({ value: { ok: true } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not write prompt log'));
  });

  it('writes no file without a prompt file', async () => {
    vi.stubEnv('DREAMER_FAKE_MODE', 'ok');
    const folder: string = join(testDir, 'none');
    await mkdir(folder, { recursive: true });
    await run();
    expect(await readdir(folder)).toEqual([]);
  });
});
