import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import { createServer, AddressInfo, Server } from 'node:net';
import { join } from 'node:path';

export interface BackendLaunch {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const host: string = '127.0.0.1';

export function createToken(): string {
  return randomBytes(32).toString('hex');
}

export function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server: Server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export function backendUrl(port: number, path: string): string {
  return `http://${host}:${port}${path}`;
}

export function buildLaunch(port: number, token: string, logsDir: string): BackendLaunch {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DREAMER_PORT: String(port),
    DREAMER_TOKEN: token,
    DREAMER_LOG_DIR: logsDir,
    DREAMER_LOG_LEVEL: app.isPackaged ? 'info' : 'debug',
    DREAMER_VERSION: APP_VERSION,
  };
  if (app.isPackaged) {
    const dir: string = join(process.resourcesPath, 'backend');
    return { command: join(dir, 'dreamer-backend.exe'), args: [], cwd: dir, env };
  }
  const dir: string = join(app.getAppPath(), '..', 'backend');
  return {
    command: join(dir, '.venv', 'Scripts', 'python.exe'),
    args: [join(dir, 'run.py')],
    cwd: dir,
    env,
  };
}
