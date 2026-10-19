import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { StepContext } from '../pipelines/pipeline-definition';
import { backendUrl } from './backend-launch';
import { BackendConnection, getBackendConnection } from './backend-process';

interface JobEvent {
  type: 'progress' | 'log' | 'done' | 'error';
  percent?: number;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
}

class JobFailure extends Error {}

const logPrefix: string = '[backend.job]';

function unavailable(reason: string): CodedError {
  return new CodedError(ErrorCode.BackendUnavailable, reason);
}

async function openJob(type: string, params: Record<string, unknown>, ctx: StepContext): Promise<Response> {
  const connection: BackendConnection | null = getBackendConnection();
  if (!connection) {
    throw unavailable('Backend is not running');
  }
  const response: Response = await fetch(backendUrl(connection.port, `/jobs/${type}`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: ctx.signal,
  });
  if (!response.ok) {
    throw unavailable(`Backend job request failed with status ${response.status}`);
  }
  return response;
}

function handleEvent(event: JobEvent, ctx: StepContext): boolean {
  if (event.type === 'progress') {
    ctx.progress(event.percent ?? 0);
  } else if (event.type === 'log') {
    ctx.log[event.level ?? 'info'](`${logPrefix} ${event.message ?? ''}`);
  } else if (event.type === 'error') {
    throw new JobFailure(event.message ?? 'Backend job failed');
  }
  return event.type === 'done';
}

async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder: TextDecoder = new TextDecoder();
  let buffer: string = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines: string[] = buffer.split('\n');
    buffer = lines.pop() ?? '';
    yield* lines.filter((line: string) => line.trim() !== '');
  }
  buffer += decoder.decode();
  if (buffer.trim() !== '') {
    yield buffer;
  }
}

async function consumeEvents(response: Response, ctx: StepContext): Promise<void> {
  if (!response.body) {
    throw unavailable('Backend job returned no stream');
  }
  for await (const line of readLines(response.body)) {
    if (handleEvent(JSON.parse(line) as JobEvent, ctx)) {
      return;
    }
  }
  throw unavailable('Backend job stream ended unexpectedly');
}

export async function runBackendJob(type: string, params: Record<string, unknown>, ctx: StepContext): Promise<void> {
  try {
    await consumeEvents(await openJob(type, params, ctx), ctx);
  } catch (error) {
    if (ctx.signal.aborted || error instanceof CodedError || error instanceof JobFailure) {
      throw error;
    }
    throw unavailable(`Backend connection lost: ${error instanceof Error ? error.message : String(error)}`);
  }
}
