import { AnalysisChannel } from '@dreamer/shared/ipc/channels';
import { AnalysisProgress, AnalysisRun } from '@dreamer/shared/models/analysis';
import { Broadcaster } from '../../ipc/broadcast-provider';

export class AnalysisRuns {
  private readonly runs: Map<string, AnalysisRun> = new Map<string, AnalysisRun>();
  private readonly listeners: Set<(novelId: string) => void> = new Set<(novelId: string) => void>();

  constructor(private readonly broadcaster: Broadcaster) {}

  get(novelId: string): AnalysisRun | null {
    return this.runs.get(novelId) ?? null;
  }

  set(novelId: string, run: AnalysisRun): void {
    this.runs.set(novelId, run);
    const progress: AnalysisProgress = {
      novelId,
      chapter: run.runningChapter,
      step: run.step,
      done: run.done,
      total: run.total,
      failed: run.failed,
    };
    this.broadcaster.send(AnalysisChannel.Progress, progress);
  }

  clear(novelId: string): void {
    this.runs.delete(novelId);
    this.changed(novelId);
  }

  changed(novelId: string): void {
    this.broadcaster.send(AnalysisChannel.Changed, { novelId });
    this.listeners.forEach((listener: (novelId: string) => void): void => listener(novelId));
  }

  onChanged(listener: (novelId: string) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
}
