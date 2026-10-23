import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { NovelLock } from '@dreamer/shared/models/novel';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { PipelineRunRepository } from '../../storage/repositories/pipeline-run-repository';

export function novelLocks(runs: PipelineRunRepository): Map<string, NovelLock> {
  const locks: Map<string, NovelLock> = new Map();
  runs.activeNovelRuns().forEach((run: PipelineRun): void => {
    if (run.novelId !== null && !locks.has(run.novelId)) {
      locks.set(run.novelId, { runId: run.id, type: run.type, label: run.label, status: run.status });
    }
  });
  return locks;
}

export function assertUnlocked(runs: PipelineRunRepository, id: string): void {
  const lock: NovelLock | undefined = novelLocks(runs).get(id);
  if (lock !== undefined) {
    throw new CodedError(ErrorCode.NovelLocked, `Novel is locked: ${id}`, lock.label || lock.type);
  }
}
