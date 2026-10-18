import { ChildProcess, execFile, spawn } from 'node:child_process';
import { createLogger, Logger } from '../logging/logger';
import { AppPaths } from '../storage/paths';
import { backendUrl, BackendLaunch, buildLaunch, createToken, findFreePort } from './backend-launch';
import { setBackendState, watchWindowLoads } from './backend-status';

const logger: Logger = createLogger('backend');
const pollIntervalMs: number = 250;
const startTimeoutMs: number = 15000;

let child: ChildProcess | null = null;
let stopping: boolean = false;

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function isHealthy(port: number, token: string): Promise<boolean> {
  try {
    const response: Response = await fetch(backendUrl(port, '/health'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(port: number, token: string, proc: ChildProcess): Promise<void> {
  const deadline: number = Date.now() + startTimeoutMs;
  while (Date.now() < deadline && child === proc) {
    if (await isHealthy(port, token)) {
      logger.info(`Backend ready on port ${port}`);
      setBackendState('running');
      return;
    }
    await delay(pollIntervalMs);
  }
  if (child === proc) {
    logger.error(`Backend did not become ready within ${startTimeoutMs} ms`);
    setBackendState('unavailable');
  }
}

function clearChild(proc: ChildProcess): void {
  if (child === proc) {
    child = null;
  }
}

function watchChild(proc: ChildProcess): void {
  proc.stderr?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((line: string) => line.trim() !== '')
      .forEach((line: string) => logger.warn(line));
  });
  proc.on('error', (error: Error) => {
    logger.error('Backend failed to start', error);
    clearChild(proc);
    setBackendState('unavailable');
  });
  proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    if (stopping) {
      return;
    }
    logger.error(`Backend exited (code ${code}, signal ${signal})`);
    clearChild(proc);
    setBackendState('unavailable');
  });
}

async function launch(paths: AppPaths): Promise<void> {
  const port: number = await findFreePort();
  const token: string = createToken();
  const options: BackendLaunch = buildLaunch(port, token, paths.logs);
  const proc: ChildProcess = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child = proc;
  watchChild(proc);
  await waitUntilReady(port, token, proc);
}

export async function startBackend(paths: AppPaths): Promise<void> {
  watchWindowLoads();
  try {
    await launch(paths);
  } catch (error) {
    logger.error('Backend failed to start', error);
    setBackendState('unavailable');
  }
}

export function stopBackend(): void {
  if (!child?.pid) {
    return;
  }
  stopping = true;
  execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => undefined);
  child = null;
}
