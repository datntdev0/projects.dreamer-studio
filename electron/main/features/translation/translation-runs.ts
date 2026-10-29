import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { TranslationLastRun, TranslationProgress, TranslationRun } from '@dreamer/shared/models/translation';
import { broadcast } from '../../ipc/broadcast';

export class TranslationRuns {
  private readonly runs: Map<string, TranslationRun> = new Map<string, TranslationRun>();
  private readonly lastRuns: Map<string, TranslationLastRun> = new Map<string, TranslationLastRun>();

  get(novelId: string): TranslationRun | null {
    const run: TranslationRun | undefined = this.runs.get(novelId);
    return run ? { ...run } : null;
  }

  set(novelId: string, run: TranslationRun): void {
    const stored: TranslationRun = { ...run };
    this.runs.set(novelId, stored);
    const progress: TranslationProgress = { novelId, run: stored };
    broadcast(TranslationChannel.Progress, progress);
  }

  clear(novelId: string): void {
    this.runs.delete(novelId);
    broadcast(TranslationChannel.Progress, { novelId, run: null });
  }

  finish(novelId: string, lastRun: TranslationLastRun): void {
    this.lastRuns.set(novelId, { ...lastRun });
  }

  lastRun(novelId: string): TranslationLastRun | null {
    const lastRun: TranslationLastRun | undefined = this.lastRuns.get(novelId);
    return lastRun ? { ...lastRun } : null;
  }
}
