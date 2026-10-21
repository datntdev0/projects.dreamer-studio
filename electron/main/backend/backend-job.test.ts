import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { StepContext } from '../features/pipelines/pipeline-definition';
import { runBackendJob } from './backend-job';
import { getBackendConnection } from './backend-process';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./backend-process', () => ({ getBackendConnection: vi.fn() }));

type Mock = ReturnType<typeof vi.fn>;

const token = 'job-token';
const ndjson = { 'Content-Type': 'application/x-ndjson' };

let server: Server;
let port: number;
let handler: (req: IncomingMessage, res: ServerResponse) => void;
let controller: AbortController;
let progress: Mock;
let log: { debug: Mock; info: Mock; warn: Mock; error: Mock };

function makeContext(): StepContext {
  return {
    params: {},
    signal: controller.signal,
    progress: progress as unknown as StepContext['progress'],
    log: log as unknown as StepContext['log'],
    checkpoint: vi.fn(),
  };
}

function line(event: object): string {
  return `${JSON.stringify(event)}\n`;
}

function respondWith(chunks: string[], status = 200): void {
  handler = (_req, res): void => {
    res.writeHead(status, ndjson);
    chunks.forEach((chunk) => res.write(chunk));
    res.end();
  };
}

async function expectCoded(promise: Promise<void>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CodedError);
  expect((error as CodedError).code).toBe(code);
}

beforeEach(async () => {
  controller = new AbortController();
  progress = vi.fn();
  log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  vi.mocked(getBackendConnection).mockReturnValue({ port, token });
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('runBackendJob', () => {
  it('reports progress events and resolves on done', async () => {
    respondWith([line({ type: 'progress', percent: 10 }), line({ type: 'progress', percent: 100 }), line({ type: 'done' })]);
    await runBackendJob('demo', {}, makeContext());
    expect(progress.mock.calls.map((call) => call[0])).toEqual([10, 100]);
  });

  it('forwards log events to the context logger', async () => {
    respondWith([line({ type: 'log', level: 'info', message: 'hello from backend' }), line({ type: 'done' })]);
    await runBackendJob('demo', {}, makeContext());
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('hello from backend'));
  });

  it('rejects with the message of an error event', async () => {
    respondWith([line({ type: 'error', code: 'JOB_FAILED', message: 'boom' })]);
    await expect(runBackendJob('demo', {}, makeContext())).rejects.toThrow('boom');
  });

  it('rejects with BACKEND_UNAVAILABLE when the stream ends without done', async () => {
    respondWith([line({ type: 'progress', percent: 50 })]);
    await expectCoded(runBackendJob('demo', {}, makeContext()), ErrorCode.BackendUnavailable);
  });

  it('rejects with BACKEND_UNAVAILABLE on a non-2xx response', async () => {
    respondWith([JSON.stringify({ code: 'JOB_UNKNOWN', message: 'x', details: null })], 404);
    await expectCoded(runBackendJob('nope', {}, makeContext()), ErrorCode.BackendUnavailable);
  });

  it('rejects with BACKEND_UNAVAILABLE without a connection', async () => {
    vi.mocked(getBackendConnection).mockReturnValue(null);
    await expectCoded(runBackendJob('demo', {}, makeContext()), ErrorCode.BackendUnavailable);
  });

  it('rejects with AbortError when the signal aborts mid-stream', async () => {
    handler = (_req, res): void => {
      res.writeHead(200, ndjson);
      res.write(line({ type: 'progress', percent: 5 }));
    };
    const promise = runBackendJob('demo', {}, makeContext());
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(5));
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('parses a line split across two chunks', async () => {
    const full = line({ type: 'progress', percent: 42 });
    handler = (_req, res): void => {
      res.writeHead(200, ndjson);
      res.write(full.slice(0, 10));
      setTimeout(() => {
        res.write(full.slice(10));
        res.end(line({ type: 'done' }));
      }, 30);
    };
    await runBackendJob('demo', {}, makeContext());
    expect(progress.mock.calls.map((call) => call[0])).toEqual([42]);
  });

  it('sends the bearer token, path and params', async () => {
    let seen = { auth: '', url: '', body: '' };
    handler = (req, res): void => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        seen = { auth: req.headers.authorization ?? '', url: req.url ?? '', body };
        res.writeHead(200, ndjson);
        res.end(line({ type: 'done' }));
      });
    };
    await runBackendJob('demo', { ticks: 3 }, makeContext());
    expect(seen.auth).toBe(`Bearer ${token}`);
    expect(seen.url).toBe('/jobs/demo');
    expect(JSON.parse(seen.body)).toEqual({ ticks: 3 });
  });
});
