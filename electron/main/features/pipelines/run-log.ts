import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, WriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { errorStack } from '@dreamer/shared/errors/error-stack';
import { PipelineChannel } from '@dreamer/shared/ipc/channels';
import { LogLevel } from '@dreamer/shared/ipc/log';
import { PipelineLogChunk, PipelineType } from '@dreamer/shared/models/pipeline';
import { broadcast } from '../../ipc/broadcast';
import { createLogger, Logger } from '../../logging/logger';
import { formatLogLine } from '../../logging/log-format';
import { AppPaths } from '@storage/paths';

const pushIntervalMs: number = 250;
const baseModule: string = 'pipeline';
const fileLogger: Logger = createLogger(baseModule);

function formatRunLine(module: string, level: LogLevel, message: string, error?: unknown): string {
  const stack: string | undefined = error === undefined ? undefined : errorStack(error);
  return formatLogLine({ time: new Date(), level, process: 'main', module, message, stack });
}

export function runLogFile(paths: AppPaths, id: string): string {
  return join(paths.pipelineLogs, `${id}.log`);
}

export function readRunLog(file: string): string[] {
  if (!existsSync(file)) {
    return [];
  }
  const lines: string[] = readFileSync(file, 'utf8').split('\n');
  return lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
}

export function appendRunLogSync(file: string, message: string): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${formatRunLine(baseModule, 'info', message)}\n`);
}

export function deleteRunLog(file: string): void {
  rmSync(file, { force: true });
}

export class RunLog {
  readonly logger: Logger;
  private stream: WriteStream | null = null;
  private pending: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private closed: boolean = false;

  constructor(
    private readonly file: string,
    private readonly runId: string,
    private readonly type: PipelineType,
  ) {
    this.logger = {
      debug: (message: string): void => this.write('debug', message),
      info: (message: string): void => this.write('info', message),
      warn: (message: string): void => this.write('warn', message),
      error: (message: string, error?: unknown): void => this.write('error', message, error),
    };
  }

  close(): void {
    this.closed = true;
    this.flush();
    this.stream?.end();
    this.stream = null;
  }

  private write(level: LogLevel, message: string, error?: unknown): void {
    if (this.closed) {
      return;
    }
    const line: string = formatRunLine(`${baseModule}.${this.type}`, level, message, error);
    this.openStream().write(`${line}\n`);
    this.pending.push(...line.split('\n'));
    this.timer ??= setTimeout((): void => this.flush(), pushIntervalMs);
  }

  private openStream(): WriteStream {
    if (!this.stream) {
      mkdirSync(dirname(this.file), { recursive: true });
      this.stream = createWriteStream(this.file, { flags: 'a' });
      this.stream.on('error', (error: Error): void => fileLogger.warn(`run log failed: ${error.message}`));
    }
    return this.stream;
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) {
      return;
    }
    const chunk: PipelineLogChunk = { runId: this.runId, lines: this.pending };
    this.pending = [];
    broadcast(PipelineChannel.Log, chunk);
  }
}
