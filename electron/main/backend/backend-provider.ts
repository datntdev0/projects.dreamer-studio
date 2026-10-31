import { ChildProcess, execFile, spawn } from 'node:child_process';
import { createLogger, Logger } from '../logging/logger';
import { AppPaths } from '@storage/paths';
import { backendAddress, backendUrl, BackendLaunch, buildLaunch, createToken, findFreePort } from './backend-launch';
import { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';
import { Broadcaster } from '../ipc/broadcast-provider';

export interface BackendConnection {
  port: number;
  token: string;
}

const logger: Logger = createLogger('backend');
const pollIntervalMs: number = 250;
const startTimeoutMs: number = 15000;

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function isHealthy(port: number, token: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response: Response = await fetch(backendUrl(port, '/health'), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export class BackendProvider {
  private child: ChildProcess | null = null;
  private backendConnection: BackendConnection | null = null;
  private stopping: boolean = false;
  private currentState: BackendState = 'starting';
  private currentAddress: string | null = null;

  constructor(private readonly broadcaster: Broadcaster) {}

  private async waitUntilReady(port: number, token: string, proc: ChildProcess): Promise<void> {
    const deadline: number = Date.now() + startTimeoutMs;
    while (Date.now() < deadline && this.child === proc) {
      if (await isHealthy(port, token)) {
        logger.info(`Backend ready on port ${port}`);
        this.setBackendState('running', backendAddress(port));
        return;
      }
      await delay(pollIntervalMs);
    }
    if (this.child === proc) {
      logger.error(`Backend did not become ready within ${startTimeoutMs} ms`);
      this.setBackendState('unavailable');
    }
  }

  private clearChild(proc: ChildProcess): void {
    if (this.child === proc) {
      this.child = null;
      this.backendConnection = null;
    }
  }

  private watchChild(proc: ChildProcess): void {
    proc.stderr?.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split(/\r?\n/)
        .filter((line: string) => line.trim() !== '')
        .forEach((line: string) => logger.warn(line));
    });
    proc.on('error', (error: Error) => {
      logger.error('Backend failed to start', error);
      this.clearChild(proc);
      this.setBackendState('unavailable');
    });
    proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.stopping || this.child !== proc) {
        return;
      }
      logger.error(`Backend exited (code ${code}, signal ${signal})`);
      this.clearChild(proc);
      this.setBackendState('unavailable');
    });
  }

  private async launch(paths: AppPaths): Promise<void> {
    const port: number = await findFreePort();
    const token: string = createToken();
    const options: BackendLaunch = buildLaunch(port, token, paths.logs);
    this.stopping = false;
    const proc: ChildProcess = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.child = proc;
    this.backendConnection = { port, token };
    this.watchChild(proc);
    await this.waitUntilReady(port, token, proc);
  }

  async start(paths: AppPaths): Promise<void> {
    try {
      await this.launch(paths);
    } catch (error) {
      logger.error('Backend failed to start', error);
      this.setBackendState('unavailable');
    }
  }

  stop(): void {
    if (!this.child?.pid) {
      return;
    }
    this.stopping = true;
    execFile('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], () => undefined);
    this.child = null;
    this.backendConnection = null;
  }

  async ping(timeoutMs: number): Promise<boolean> {
    const current: BackendConnection | null = this.backendConnection;
    return current !== null && isHealthy(current.port, current.token, AbortSignal.timeout(timeoutMs));
  }

  connection(): BackendConnection | null {
    return this.child && this.status().state === 'running' ? this.backendConnection : null;
  }

  private setBackendState(state: BackendState, address: string | null = null): void {
    if (state === this.currentState && address === this.currentAddress) return;
    this.currentState = state;
    this.currentAddress = address;
    this.broadcaster.send(BackendChannel.Status, this.status());
  }

  status(): BackendStatus {
    return { state: this.currentState, address: this.currentAddress };
  }
}
