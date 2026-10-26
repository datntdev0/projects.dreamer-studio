import { stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { LLM_CLIS, LLM_VERSION_TIMEOUT_MS, LlmCliId, LlmCliStatus } from '@dreamer/shared/models/llm';
import { createLogger, Logger } from '../../logging/logger';
import { ADAPTERS } from './llm-adapter';
import { spawnCli, SpawnCliResult } from './llm-process';

const logger: Logger = createLogger('llm');

function knownPaths(id: LlmCliId): string[] {
  if (process.platform !== 'win32') {
    const executable: string = LLM_CLIS[id].executable;
    return [
      join(homedir(), '.local', 'bin', executable),
      join(homedir(), '.npm-global', 'bin', executable),
      join('/usr/local/bin', executable),
    ];
  }
  const env: NodeJS.ProcessEnv = process.env;
  const userProfile: string = env.USERPROFILE ?? homedir();
  const appData: string | undefined = env.APPDATA;
  const localAppData: string | undefined = env.LOCALAPPDATA;
  if (id === 'claude') {
    return [join(userProfile, '.local', 'bin', 'claude.exe'), ...(appData ? [join(appData, 'npm', 'claude.cmd')] : [])];
  }
  if (id === 'codex') {
    return [
      ...(localAppData ? [join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')] : []),
      ...(appData ? [join(appData, 'npm', 'codex.cmd')] : []),
    ];
  }
  return localAppData ? [join(localAppData, 'agy', 'bin', 'agy.exe')] : [];
}

async function pathResult(id: LlmCliId): Promise<string | null> {
  try {
    const result: SpawnCliResult = await spawnCli({
      path: process.platform === 'win32' ? 'where.exe' : 'which',
      args: [LLM_CLIS[id].executable],
      stdin: null,
      cwd: tmpdir(),
      timeoutMs: LLM_VERSION_TIMEOUT_MS,
    });
    if (result.exitCode !== 0 || result.timedOut) return null;
    const lines: string[] = result.stdout
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean);
    return process.platform === 'win32'
      ? (lines.find((line: string) => /\.(exe|cmd)$/i.test(line)) ?? null)
      : (lines[0] ?? null);
  } catch {
    return null;
  }
}

export async function checkCliPath(id: LlmCliId, path: string): Promise<string | null> {
  try {
    if (!(await stat(path)).isFile()) return null;
    const result: SpawnCliResult = await spawnCli({
      path,
      args: ADAPTERS[id].versionArgs,
      stdin: null,
      cwd: tmpdir(),
      timeoutMs: LLM_VERSION_TIMEOUT_MS,
    });
    const match: RegExpMatchArray | null =
      result.exitCode === 0 && !result.timedOut ? result.stdout.trim().match(LLM_CLIS[id].versionPattern) : null;
    if (match) return match[1];
    logger.warn(`${id} version mismatch at ${path}: ${result.stdout.slice(0, 2048)}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    logger.warn(`${id} version check failed at ${path}: ${String(error)}`);
  }
  return null;
}

export async function detectCli(id: LlmCliId, customPath: string | undefined): Promise<LlmCliStatus> {
  if (customPath !== undefined) {
    const version: string | null = await checkCliPath(id, customPath);
    logger.info(`${id} custom path ${customPath}: ${version ?? 'invalid'}`);
    return { id, state: version === null ? 'invalidPath' : 'installed', version, path: customPath, customPath: true };
  }
  const fromPath: string | null = await pathResult(id);
  const candidates: string[] = [...new Set([...(fromPath ? [fromPath] : []), ...knownPaths(id)])];
  for (const path of candidates) {
    const version: string | null = await checkCliPath(id, path);
    if (version !== null) {
      logger.info(`${id} found at ${path}, version ${version}`);
      return { id, state: 'installed', version, path, customPath: false };
    }
  }
  logger.info(`${id} not installed`);
  return { id, state: 'notInstalled', version: null, path: null, customPath: false };
}
