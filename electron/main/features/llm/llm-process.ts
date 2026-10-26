import { ChildProcess, execFile, spawn } from 'node:child_process';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';

export interface SpawnCliInput {
  path: string;
  args: string[];
  stdin: string | null;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
}

export interface SpawnCliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function quoteWindowsArg(value: string): string {
  let result: string = '"';
  let slashes: number = 0;
  for (const char of value) {
    if (char === '\\') {
      slashes += 1;
      continue;
    }
    if (char === '"') {
      result += '\\'.repeat(slashes * 2 + 1) + '"';
      slashes = 0;
      continue;
    }
    result += '\\'.repeat(slashes) + char;
    slashes = 0;
  }
  return result + '\\'.repeat(slashes * 2) + '"';
}

function spawnOptions(input: SpawnCliInput): { command: string; args: string[]; verbatim: boolean } {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(input.path)) {
    return { command: input.path, args: input.args, verbatim: false };
  }
  if ([input.path, ...input.args].some((arg: string) => /[&|<>^%!\r\n]/.test(arg))) {
    throw new CodedError(ErrorCode.LlmCliFailed, 'Unsafe cmd.exe argument');
  }
  const command: string = [input.path, ...input.args].map(quoteWindowsArg).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${command}"`], verbatim: true };
}

function killTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise<void>((resolve) => {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, (error) => {
        if (error) child.kill('SIGKILL');
        resolve();
      });
    });
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  return Promise.resolve();
}

function appendCapped(chunks: Buffer[], chunk: Buffer, size: number, cap: number): number {
  const remaining: number = cap - size;
  if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
  return size + Math.min(Math.max(remaining, 0), chunk.length);
}

export function spawnCli(input: SpawnCliInput): Promise<SpawnCliResult> {
  if (input.signal?.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  const options: { command: string; args: string[]; verbatim: boolean } = spawnOptions(input);
  const cap: number = input.maxOutputBytes ?? 8 * 1024 * 1024;
  return new Promise<SpawnCliResult>((resolve, reject) => {
    const child: ChildProcess = spawn(options.command, options.args, {
      cwd: input.cwd,
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: options.verbatim,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutSize: number = 0;
    let stderrSize: number = 0;
    let timedOut: boolean = false;
    let aborted: boolean = false;
    let settled: boolean = false;
    let killPromise: Promise<void> = Promise.resolve();
    const timeout: NodeJS.Timeout = setTimeout(() => {
      timedOut = true;
      killPromise = killTree(child);
    }, input.timeoutMs);
    const onAbort = (): void => {
      aborted = true;
      killPromise = killTree(child);
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutSize = appendCapped(stdout, chunk, stdoutSize, cap);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrSize = appendCapped(stderr, chunk, stderrSize, cap);
    });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input.stdin ?? undefined);
    const cleanup = (): void => {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', onAbort);
    };
    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new CodedError(ErrorCode.LlmCliFailed, `CLI could not start: ${error.message}`));
    });
    child.on('close', (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      void killPromise.then(() => {
        if (aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        } else {
          resolve({
            exitCode,
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
            timedOut,
          });
        }
      });
    });
  });
}
