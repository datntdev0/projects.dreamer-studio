import { Component, computed, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '../../../core/desktop-api';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PipelineStore } from '../../../core/stores/pipeline-store';
import { PipelineActions } from '../pipeline-actions';
import { parseLogLine, type LogLineView, takeUnseen } from '../run-log';
import { isActiveRun } from '../run-status';

const SCROLL_END_PX = 4;

@Component({
  selector: 'ds-run-log',
  imports: [ButtonDirective, CheckboxComponent, DotComponent, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './run-log.component.html',
})
export class RunLogComponent {
  readonly runId = input<string | null>(null);

  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly store: PipelineStore = inject(PipelineStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly actions: PipelineActions = inject(PipelineActions);
  private readonly logElement = viewChild<ElementRef<HTMLElement>>('log');
  private readonly seenCount = signal<number>(0);

  protected readonly run = computed<PipelineRun | undefined>(() => {
    const id: string | null = this.runId();
    return id ? this.store.run(id)() : undefined;
  });
  protected readonly active = computed<boolean>(() => {
    const run: PipelineRun | undefined = this.run();
    return !!run && isActiveRun(run);
  });
  protected readonly lines = signal<LogLineView[]>([]);
  protected readonly loadFailed = signal<boolean>(false);
  protected readonly follow = signal<boolean>(true);
  protected readonly unseen = computed<number>(() => (this.follow() ? 0 : this.lines().length - this.seenCount()));
  protected readonly emptyKey = computed<string>(() => {
    if (!this.run()) return 'run.log.select';
    if (this.loadFailed()) return 'errors.MAIN_UNEXPECTED.title';
    return this.run()?.status === 'queued' ? 'run.log.waitStart' : 'run.log.waitFirst';
  });

  constructor() {
    effect((onCleanup) => {
      const id: string | null = this.runId();
      untracked(() => this.reset());
      if (id) onCleanup(untracked(() => this.watch(id)));
    });
    effect(() => {
      this.lines();
      if (untracked(() => this.follow())) untracked(() => this.scrollToEnd());
    });
  }

  protected setFollow(follow: boolean): void {
    this.follow.set(follow);
    if (follow) this.scrollToEnd();
    else this.seenCount.set(this.lines().length);
  }

  protected onScroll(): void {
    const element: HTMLElement | undefined = this.logElement()?.nativeElement;
    if (!element) return;
    const atEnd: boolean = element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_END_PX;
    if (atEnd !== this.follow()) this.setFollow(atEnd);
  }

  protected copy(): void {
    const text: string = this.lines()
      .map((line) => line.raw)
      .join('\n');
    this.actions.copy(text, 'toast.logCopied');
  }

  private reset(): void {
    this.lines.set([]);
    this.loadFailed.set(false);
    this.follow.set(true);
  }

  private watch(id: string): () => void {
    let buffer: string[] | null = [];
    let stopped = false;
    const seen = new Set<string>();
    const unsubscribe: () => void = this.desktopApi.onPipelineLog((chunk) => {
      if (chunk.runId !== id) return;
      if (buffer) buffer.push(...chunk.lines);
      else this.append(takeUnseen(chunk.lines, seen));
    });
    this.desktopApi
      .pipelineLog(id)
      .then((loaded) => {
        if (stopped) return;
        const pending: string[] = buffer ?? [];
        buffer = null;
        loaded.forEach((line) => seen.add(line));
        this.append([...loaded, ...takeUnseen(pending, seen)]);
      })
      .catch(() => {
        if (!stopped) this.loadFailed.set(true);
      });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }

  private append(raw: string[]): void {
    const language = this.i18n.language();
    this.lines.update((lines) => [...lines, ...raw.map((line) => parseLogLine(line, language))]);
  }

  private scrollToEnd(): void {
    requestAnimationFrame(() => {
      const element: HTMLElement | undefined = this.logElement()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
