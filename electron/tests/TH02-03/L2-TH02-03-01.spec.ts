import { workspace } from '../support/fixtures';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { LLM_CLI_IDS, type LlmCliId, type LlmCliStatus } from '@dreamer/shared/models/llm';
import { SettingsStore } from '../../main/features/settings/settings-store';
import { LlmService } from '../../main/features/llm/llm-service';
import { LlmDetector } from '../../main/features/llm/llm-detector';
import { LlmRunner } from '../../main/features/llm/llm-runner';

import { ADAPTERS } from '../../main/features/llm/llm-adapter';
import { LlmProcessProvider } from '../../main/features/llm/llm-process';

describe('[TH02-03] L2-TH02-03-01 local LLM configuration and execution', () => {
  let work: ReturnType<typeof workspace>;
  let settings: SettingsStore;
  let service: LlmService;
  let statuses: LlmCliStatus[];
  let detector: LlmDetector;
  let runner: LlmRunner;
  beforeEach(() => {
    vi.resetAllMocks();
    work = workspace();
    settings = new SettingsStore(join(work.root, 'settings.json'), work.root);
    settings.load();
    statuses = LLM_CLI_IDS.map((id) => ({
      id,
      state: 'installed',
      version: '1.2.3',
      path: join(work.root, `${id}.exe`),
      customPath: false,
    }));
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const process = new LlmProcessProvider();
    detector = new LlmDetector(process, ADAPTERS, logger);
    runner = new LlmRunner(process, logger);
    vi.spyOn(detector, 'checkCliPath');
    vi.spyOn(detector, 'detectCli').mockImplementation(async (id: LlmCliId) =>
      statuses.find((status) => status.id === id)!,
    );
    vi.spyOn(runner, 'run').mockResolvedValue({ value: { ok: true }, usage: null, durationMs: 5 });
    service = new LlmService(settings, () => work.paths, detector, runner, ADAPTERS, logger);
  });
  afterEach(() => work.dispose());
  const request = { prompt: 'Reply with JSON', schema: { type: 'object' }, timeoutMs: 1000 };

  it('AC1 detects only supported CLIs with their availability/version and emits status updates', async () => {
    const changed = vi.fn();
    service.onChanged(changed);
    expect(await service.detect()).toEqual(statuses);
    expect(vi.mocked(detector.detectCli).mock.calls.map(([id]) => id)).toEqual(LLM_CLI_IDS);
    expect(changed).toHaveBeenCalledWith(statuses);
    expect((await service.status()).every((status) => LLM_CLI_IDS.includes(status.id))).toBe(true);
  });

  it('AC2 accepts a validated custom path, persists it, and rejects an invalid replacement', async () => {
    statuses[0] = { ...statuses[0], state: 'notInstalled', version: null, path: null };
    await service.detect();
    const path = join(work.root, 'custom', 'claude.exe');
    vi.mocked(detector.checkCliPath).mockResolvedValueOnce('2.0');
    expect(await service.setPath({ cli: 'claude', path })).toMatchObject({
      state: 'installed',
      path,
      customPath: true,
      version: '2.0',
    });
    const reopened = new SettingsStore(join(work.root, 'settings.json'), work.root);
    reopened.load();
    expect(reopened.get().llm.paths.claude).toBe(path);
    vi.mocked(detector.checkCliPath).mockResolvedValueOnce(null);
    await expect(service.setPath({ cli: 'claude', path: join(work.root, 'invalid.exe') })).rejects.toMatchObject({
      code: ErrorCode.LlmPathInvalid,
    });
    expect(settings.get().llm.paths.claude).toBe(path);
  });

  it('AC3 exposes connection success and a useful coded failure without rejecting the test request', async () => {
    expect(await service.test('claude')).toEqual({ ok: true, durationMs: 5, error: null });
    vi.mocked(runner.run).mockRejectedValueOnce(new CodedError(ErrorCode.LlmTimeout, 'Connection timed out'));
    expect(await service.test('claude')).toMatchObject({
      ok: false,
      error: { code: ErrorCode.LlmTimeout, message: 'Connection timed out' },
    });
  });

  it('AC4 uses feature override first and the persisted default for features without an override', async () => {
    settings.update({
      llm: { default: { cli: 'claude', model: null }, features: { worldAnalysis: { cli: 'codex', model: null } } },
    });
    await service.runForFeature('worldAnalysis', request);
    expect(runner.run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ cli: 'codex' }),
        path: statuses.find((status) => status.id === 'codex')!.path,
      }),
    );
    await service.runForFeature('contentTranslation', request);
    expect(runner.run).toHaveBeenLastCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ cli: 'claude' }) }),
    );
  });

  it('AC5 blocks feature execution after the configured CLI disappears', async () => {
    settings.update({ llm: { default: { cli: 'claude', model: null } } });
    await service.detect();
    statuses = statuses.map((status) =>
      status.id === 'claude' ? { ...status, state: 'notInstalled', version: null, path: null } : status,
    );
    await service.detect();
    await expect(service.runForFeature('worldAnalysis', request)).rejects.toMatchObject({
      code: ErrorCode.LlmNotAvailable,
      details: 'defaultUnavailable',
    });
    expect(runner.run).not.toHaveBeenCalled();
  });
});
