import {
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  InjectionToken,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Provider, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, provideRouter, withHashLocation } from '@angular/router';
import type { Routes } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { map } from 'rxjs';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmHostComponent } from '@components/dialog/confirm-host.component';
import { ConfirmService } from '@components/dialog/confirm.service';
import { DialogComponent } from '@components/dialog/dialog.component';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { SplitterDirective } from '@components/splitter/splitter.directive';
import { AreaStateComponent } from '@components/state/area-state.component';
import { BadgeComponent } from '@components/status/badge.component';
import { DotComponent } from '@components/status/dot.component';
import { PillComponent } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '../../src/core/i18n/i18n.service';
import { TranslatePipe } from '../../src/core/i18n/translate.pipe';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../src/core/slots';
import type { PipelineRunStatus, PipelineSlot } from '../../src/core/slots';
import { formatDateTime, formatDuration } from '../../src/features/home/format';
import { ComingSoonPage } from '../../src/shell/coming-soon/coming-soon.page';
import { PageTitleDirective } from '../../src/shell/page-title.directive';
import { MODULES } from '../../src/shell/registry/modules';
import { ShellComponent } from '../../src/shell/shell.component';
import { buildRoutes } from '../../src/shell/shell.routes';
import { provideDesktopApi } from '../fixtures/desktop-api';
import {
  ACTIVE_RUNS,
  DEMO_BACKEND_STEP,
  DEMO_STEPS,
  HISTORY_PAGE_SIZE,
  LONG_HISTORY_RUNS,
  RUNNING_RUN,
  runLog,
  shortId,
  type PipelineRunFixture,
} from '../fixtures/pipelines';

type SlotState = 'loading' | 'ready' | 'error';
type View = 'queue' | 'history';
type StepState = 'done' | 'running' | 'failed' | 'cancelled' | 'pending';

interface RunsPreview {
  state: SlotState;
  runs: PipelineRunFixture[];
  error?: string;
}

interface PipelinesPreview {
  active: RunsPreview;
  history: RunsPreview;
  live?: boolean;
  packaged?: boolean;
}

interface StatusView {
  label: string;
  icon: string | null;
}

interface StepView {
  index: number;
  name: string;
  state: StepState;
  icon: string;
  label: string;
  backend: boolean;
}

interface LogLineView {
  time: string;
  level: string;
  message: string;
}

interface OptionView {
  value: string;
  label: string;
}

const DB_ERROR = 'SQLITE_CANTOPEN: unable to open database file';
const LIVE_TICK_MS = 500;
const LIVE_STEP_PROGRESS = 2;
const BACKEND_ERROR = 'connect ECONNREFUSED 127.0.0.1:8765';
const LOAD_MORE_MS = 600;
const SCROLL_END_PX = 4;
const DEMO_TYPE = 'demo';
const VIEWS: View[] = ['queue', 'history'];

const STATUS_VIEWS: Record<PipelineRunStatus, StatusView> = {
  queued: { label: 'run.queued', icon: 'clock' },
  running: { label: 'run.running', icon: null },
  succeeded: { label: 'run.succeeded', icon: 'check' },
  failed: { label: 'run.failed', icon: 'alert-circle' },
  cancelled: { label: 'run.cancelled', icon: 'stop' },
};

const STEP_VIEWS: Record<StepState, { icon: string; label: string }> = {
  done: { icon: 'check', label: 'run.stepState.done' },
  running: { icon: 'play', label: 'run.running' },
  failed: { icon: 'alert-circle', label: 'run.failed' },
  cancelled: { icon: 'stop', label: 'run.cancelled' },
  pending: { icon: 'minus', label: 'run.stepState.pending' },
};

const DEMO_STEP_KEYS: string[] = [
  'run.demo.step.1',
  'run.demo.step.2',
  'run.demo.step.3',
  'run.demo.step.4',
  'run.demo.step.5',
];

const PREVIEW = new InjectionToken<PipelinesPreview>('PIPELINES_PREVIEW');

function isActive(run: PipelineRunFixture): boolean {
  return run.status === 'running' || run.status === 'queued';
}

function stepState(run: PipelineRunFixture, index: number): StepState {
  if (run.status === 'succeeded' || index < run.step) return 'done';
  if (index > run.step || run.status === 'queued') return 'pending';
  if (run.status === 'running') return 'running';
  return run.status === 'failed' ? 'failed' : 'cancelled';
}

@Injectable({ providedIn: 'root' })
class RunText {
  private readonly i18n: I18nService = inject(I18nService);

  name(run: PipelineRunFixture): string {
    return this.i18n.t('run.name', { type: this.i18n.t('run.type.demo'), short: shortId(run.id) });
  }

  stepName(step: number): string {
    return step > 0 ? this.i18n.t(DEMO_STEP_KEYS[step - 1]) : '';
  }

  step(run: PipelineRunFixture): string {
    return this.i18n.t('run.stepOf', { step: run.step, steps: run.steps, name: this.stepName(run.step) });
  }

  shortStep(run: PipelineRunFixture): string {
    return this.i18n.t('pipelines.row.step', { step: run.step, steps: run.steps, name: this.stepName(run.step) });
  }

  dateTime(iso: string): string {
    return formatDateTime(iso, this.i18n.language());
  }

  shortDateTime(iso: string): string {
    return this.format(iso, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  }

  error(run: PipelineRunFixture): string {
    return run.errorCode ? this.i18n.t(`errors.${run.errorCode}.title`) : (run.error ?? '');
  }

  cancelReason(run: PipelineRunFixture): string {
    return this.i18n.t(run.cancelReason === 'appClosed' ? 'run.cancel.appClosed' : 'run.cancel.user');
  }

  result(run: PipelineRunFixture): string {
    if (run.status === 'succeeded') return this.i18n.t('pipelines.result.steps', { done: run.steps, steps: run.steps });
    const step: string = this.i18n.t('pipelines.reason.step', { step: run.step });
    if (run.status === 'failed') return `${step} · ${this.error(run)}`;
    return run.status === 'cancelled' ? `${step} · ${this.cancelReason(run)}` : '';
  }

  logLine(raw: string): LogLineView {
    const match: RegExpMatchArray | null = raw.match(/^(\S+) (\S+) (\S+) (\S+) (.*)$/);
    if (!match || Number.isNaN(Date.parse(match[1]))) return { time: '', level: '', message: raw };
    const time: string = this.format(match[1], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    return { time, level: match[2].padEnd(5), message: match[5] };
  }

  private format(iso: string, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.i18n.language(), options).format(new Date(iso));
  }
}

@Injectable({ providedIn: 'root' })
class PipelinesPreviewStore {
  private readonly preview: PipelinesPreview = inject(PREVIEW);

  readonly active = signal<RunsPreview>(this.preview.active);
  readonly history = signal<RunsPreview>(this.preview.history);
  readonly logs = signal<Record<string, string[]>>(
    Object.fromEntries([...this.preview.active.runs, ...this.preview.history.runs].map((run) => [run.id, runLog(run)])),
  );
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly router: Router = inject(Router);
  private readonly text: RunText = inject(RunText);

  readonly packaged: boolean = this.preview.packaged ?? false;
  readonly view = signal<View>('queue');
  readonly statusFilter = signal<string>('all');
  readonly typeFilter = signal<string>('all');
  readonly checked = signal<string[]>([]);
  readonly limit = signal<number>(HISTORY_PAGE_SIZE);
  readonly loadingMore = signal<boolean>(false);

  readonly activeRuns = computed<PipelineRunFixture[]>(() => this.active().runs.filter(isActive));
  readonly runningRun = computed<PipelineRunFixture | undefined>(() =>
    this.activeRuns().find((run) => run.status === 'running'),
  );
  readonly runningCount = computed<number>(() => this.activeRuns().filter((run) => run.status === 'running').length);
  readonly queuedCount = computed<number>(() => this.activeRuns().length - this.runningCount());
  readonly filtered = computed<boolean>(() => this.statusFilter() !== 'all' || this.typeFilter() !== 'all');
  readonly matchingRuns = computed<PipelineRunFixture[]>(() =>
    this.history().runs.filter(
      (run) =>
        (this.statusFilter() === 'all' || run.status === this.statusFilter()) &&
        (this.typeFilter() === 'all' || run.type === this.typeFilter()),
    ),
  );
  readonly loadedRuns = computed<PipelineRunFixture[]>(() => this.matchingRuns().slice(0, this.limit()));
  readonly hasMore = computed<boolean>(() => this.loadedRuns().length < this.matchingRuns().length);
  readonly activeSlot: Signal<PipelineSlot> = computed(() => this.active());
  readonly recentSlot: Signal<PipelineSlot> = computed(() => ({
    ...this.history(),
    runs: [...this.active().runs.filter((run) => run.status === 'running'), ...this.history().runs],
  }));

  constructor() {
    if (!this.preview.live) return;
    const timer: ReturnType<typeof setInterval> = setInterval(() => this.tick(), LIVE_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  find(id: string): PipelineRunFixture | undefined {
    return [...this.active().runs, ...this.history().runs].find((run) => run.id === id);
  }

  setStatus(status: string): void {
    this.statusFilter.set(status);
    this.limit.set(HISTORY_PAGE_SIZE);
  }

  setType(type: string): void {
    this.typeFilter.set(type);
    this.limit.set(HISTORY_PAGE_SIZE);
  }

  clearFilters(): void {
    this.setStatus('all');
    this.setType('all');
  }

  loadMore(): void {
    this.loadingMore.set(true);
    setTimeout(() => {
      this.limit.update((limit) => limit + HISTORY_PAGE_SIZE);
      this.loadingMore.set(false);
    }, LOAD_MORE_MS);
  }

  toggleChecked(id: string, checked: boolean): void {
    this.checked.update((ids) => (checked ? [...ids, id] : ids.filter((item) => item !== id)));
  }

  checkLoaded(checked: boolean): void {
    this.checked.set(checked ? this.loadedRuns().map((run) => run.id) : []);
  }

  start(failAt: number): PipelineRunFixture {
    const id: string = crypto.randomUUID();
    const running: boolean = this.runningCount() > 0;
    const run: PipelineRunFixture = {
      ...RUNNING_RUN,
      id,
      name: `Demo pipeline #${shortId(id)}`,
      status: running ? 'queued' : 'running',
      progress: 0,
      step: running ? 0 : 1,
      stepName: running ? '' : DEMO_STEPS[0],
      failAt: failAt || null,
      startedAt: new Date().toISOString(),
      seconds: 0,
    };
    this.active.update((slot) => ({ ...slot, runs: [...slot.runs, run] }));
    this.logs.update((logs) => ({ ...logs, [run.id]: runLog(run) }));
    return run;
  }

  cancel(id: string): void {
    const run: PipelineRunFixture | undefined = this.active().runs.find((item) => item.id === id);
    if (!run) return;
    this.finish({ ...run, status: 'cancelled', cancelReason: 'user', finishedAt: new Date().toISOString() });
    this.logs.update((logs) => ({ ...logs, [id]: runLog(this.find(id) ?? run) }));
  }

  remove(ids: string[]): void {
    this.history.update((slot) => ({ ...slot, runs: slot.runs.filter((run) => !ids.includes(run.id)) }));
    this.checked.update((checked) => checked.filter((id) => !ids.includes(id)));
  }

  private tick(): void {
    const run: PipelineRunFixture | undefined = this.runningRun();
    if (!run) return;
    const progress: number = Math.min(100, run.progress + LIVE_STEP_PROGRESS);
    const step: number = Math.min(run.steps, Math.floor(progress / (100 / run.steps)) + 1);
    const next: PipelineRunFixture = {
      ...run,
      progress,
      step,
      stepName: DEMO_STEPS[step - 1],
      seconds: run.seconds + 1,
    };
    const message: string =
      step === run.step ? `${next.stepName}: ${progress}%` : `Step ${step}/${run.steps} started: ${next.stepName}`;
    this.appendLog(run.id, step === run.step ? 'DEBUG' : 'INFO', message);
    if (run.failAt && step === run.failAt && progress >= (step - 0.5) * (100 / run.steps)) {
      this.fail(next);
    } else if (progress >= 100) {
      this.succeed(next);
    } else {
      this.active.update((slot) => ({ ...slot, runs: slot.runs.map((item) => (item.id === run.id ? next : item)) }));
    }
  }

  private succeed(run: PipelineRunFixture): void {
    this.appendLog(run.id, 'INFO', 'Run succeeded');
    this.finish({ ...run, status: 'succeeded', finishedAt: new Date().toISOString() });
    this.toast.show({
      kind: 'success',
      title: this.i18n.t('toast.pipeline.succeeded'),
      message: this.i18n.t('toast.pipeline.succeededMsg', {
        name: this.text.name(run),
        duration: formatDuration(run.seconds),
      }),
      action: { label: this.i18n.t('toast.pipeline.view'), run: () => this.open(run) },
    });
  }

  private fail(run: PipelineRunFixture): void {
    const backend: boolean = run.step === DEMO_BACKEND_STEP;
    const failed: PipelineRunFixture = {
      ...run,
      status: 'failed',
      errorCode: backend ? 'BACKEND_UNAVAILABLE' : null,
      error: backend ? BACKEND_ERROR : `Simulated failure at step ${run.step} (Fail at step = ${run.step}).`,
      finishedAt: new Date().toISOString(),
    };
    this.appendLog(run.id, 'ERROR', `Step ${run.step}/${run.steps} failed: ${failed.error}`);
    this.finish(failed);
    this.toast.show({
      kind: 'danger',
      title: this.i18n.t('toast.pipeline.failed'),
      message: this.i18n.t('toast.pipeline.failedMsg', {
        name: this.text.name(failed),
        step: failed.step,
        error: this.text.error(failed),
      }),
      action: { label: this.i18n.t('toast.pipeline.viewLog'), run: () => this.open(failed) },
    });
  }

  private finish(run: PipelineRunFixture): void {
    const rest: PipelineRunFixture[] = this.active().runs.filter((item) => item.id !== run.id);
    const promoted: PipelineRunFixture[] = rest.map((item, index): PipelineRunFixture =>
      index === 0 && item.status === 'queued' && !rest.some((other) => other.status === 'running')
        ? { ...item, status: 'running', step: 1, stepName: DEMO_STEPS[0], startedAt: new Date().toISOString() }
        : item,
    );
    this.active.update((slot) => ({ ...slot, runs: promoted }));
    this.history.update((slot) => ({ ...slot, runs: [run, ...slot.runs] }));
    const started: PipelineRunFixture | undefined = promoted.find((item) => item.status === 'running');
    if (started && !rest.some((item) => item.status === 'running'))
      this.logs.update((logs) => ({ ...logs, [started.id]: runLog(started) }));
  }

  private appendLog(id: string, level: string, message: string): void {
    const line = `${new Date().toISOString()} ${level} main pipeline.demo ${message}`;
    this.logs.update((logs) => ({ ...logs, [id]: [...(logs[id] ?? []), line] }));
  }

  private open(run: PipelineRunFixture): void {
    this.view.set('history');
    void this.router.navigate(['/pipelines', run.id]);
  }
}

@Injectable({ providedIn: 'root' })
class PipelineActions {
  private readonly router: Router = inject(Router);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly store: PipelinesPreviewStore = inject(PipelinesPreviewStore);
  private readonly text: RunText = inject(RunText);

  select(run: PipelineRunFixture): void {
    void this.router.navigate(['/pipelines', run.id]);
  }

  async cancel(run: PipelineRunFixture): Promise<void> {
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('pipelines.cancelConfirm.title', { name: this.text.name(run) }),
      message:
        run.status === 'queued'
          ? this.i18n.t('pipelines.cancelConfirm.messageQueued')
          : this.i18n.t('pipelines.cancelConfirm.messageRunning'),
      confirmLabel: this.i18n.t('pipelines.action.cancelRun'),
      cancelLabel: this.i18n.t('pipelines.cancelConfirm.keep'),
      danger: true,
    });
    if (confirmed) this.store.cancel(run.id);
  }

  async remove(ids: string[]): Promise<boolean> {
    const count: number = ids.length;
    const many: boolean = count > 1;
    const confirmed: boolean = await this.confirm.confirm({
      title: many
        ? this.i18n.t('pipelines.deleteConfirm.titleMany', { count })
        : this.i18n.t('pipelines.deleteConfirm.titleOne'),
      message: many
        ? this.i18n.t('pipelines.deleteConfirm.messageMany')
        : this.i18n.t('pipelines.deleteConfirm.messageOne'),
      confirmLabel: this.i18n.t('pipelines.action.delete'),
      cancelLabel: this.i18n.t('common.cancel'),
      danger: true,
    });
    if (!confirmed) return false;
    this.store.remove(ids);
    this.toast.show({
      kind: 'success',
      title: many ? this.i18n.t('toast.runsDeleted', { count }) : this.i18n.t('toast.runDeleted'),
    });
    return true;
  }

  copy(text: string, title: string): void {
    void navigator.clipboard?.writeText(text);
    this.toast.show({ kind: 'success', title: this.i18n.t(title) });
  }
}

@Component({
  selector: 'ds-run-status',
  imports: [DotComponent, IconComponent, TranslatePipe],
  host: { class: 'pipeline-status', 'data-testid': 'pipeline-status', '[attr.data-status]': 'status()' },
  template: `
    @if (view().icon; as icon) {
      <ds-icon [name]="icon" size="sm" />
    } @else {
      <ds-dot kind="primary" pulse />
    }
    {{ view().label | t }}
  `,
})
class RunStatusComponent {
  readonly status = input.required<PipelineRunStatus>();
  protected readonly view = computed<StatusView>(() => STATUS_VIEWS[this.status()]);
}

@Component({
  selector: 'ds-pipeline-queue-table',
  imports: [ButtonDirective, IconComponent, ProgressComponent, RunStatusComponent, TooltipDirective, TranslatePipe],
  template: `
    <table class="pipeline-grid" data-testid="pipelines-queue-table" [attr.aria-label]="'pipelines.view.queue' | t">
      <thead>
        <tr>
          <th>{{ 'pipelines.col.pipeline' | t }}</th>
          <th class="col-status">{{ 'pipelines.col.status' | t }}</th>
          <th class="col-progress">{{ 'run.progress' | t }}</th>
          <th>{{ 'pipelines.col.step' | t }}</th>
          <th class="col-number num">{{ 'pipelines.col.elapsed' | t }}</th>
          <th class="col-action">
            <span class="visually-hidden">{{ 'pipelines.col.actions' | t }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        @if (loading()) {
          @for (row of skeletonRows; track row) {
            <tr>
              <td><div class="skeleton" style="width: var(--progress-w)"></div></td>
              <td><div class="skeleton" style="width: var(--home-tile-size)"></div></td>
              <td><div class="skeleton" style="width: var(--progress-w)"></div></td>
              <td><div class="skeleton" style="width: var(--home-when-w)"></div></td>
              <td></td>
              <td></td>
            </tr>
          }
        } @else {
          @for (run of runs(); track run.id) {
            <tr
              data-testid="pipelines-queue-row"
              [attr.data-run-id]="run.id"
              [attr.data-status]="run.status"
              [attr.aria-current]="run.id === selectedId() ? 'true' : null"
              tabindex="0"
              (click)="actions.select(run)"
              (keydown.enter)="actions.select(run)"
            >
              <td class="pipeline-name" data-testid="pipelines-run-name">{{ text.name(run) }}</td>
              <td><ds-run-status [status]="run.status" /></td>
              <td>
                @if (run.status === 'running') {
                  <span class="pipeline-progress-cell"
                    ><ds-progress data-testid="pipelines-run-progress" [value]="run.progress" /><span class="num"
                      >{{ run.progress }}%</span
                    ></span
                  >
                } @else {
                  <span class="pipeline-muted">—</span>
                }
              </td>
              <td class="pipeline-muted" data-testid="pipelines-run-step">
                @if (run.status === 'running') {
                  {{ text.shortStep(run) }}
                } @else if (waitingFor(); as running) {
                  {{ 'pipelines.row.queued' | t: { name: '#' + short(running) } }}
                }
              </td>
              <td class="num">{{ run.status === 'queued' ? '—' : duration(run.seconds) }}</td>
              <td class="num col-action">
                <button
                  dsBtn
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="pipeline-row-action"
                  data-testid="pipelines-run-cancel"
                  [iconOnly]="true"
                  [attr.aria-label]="'pipelines.action.cancelRun' | t"
                  [dsTooltip]="'pipelines.action.cancelRun' | t"
                  (click)="$event.stopPropagation(); actions.cancel(run)"
                  (keydown.enter)="$event.stopPropagation()"
                >
                  <ds-icon name="stop" size="sm" />
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td class="ds-table-empty" colspan="6" data-testid="pipelines-queue-empty">
                <span class="pipeline-name">{{ 'status.pipeline.idle' | t }}</span> ·
                {{ 'pipelines.active.emptyDesc' | t }}
              </td>
            </tr>
          }
        }
      </tbody>
    </table>
  `,
})
class QueueTableComponent {
  readonly runs = input.required<PipelineRunFixture[]>();
  readonly loading = input<boolean>(false);
  readonly selectedId = input<string | null>(null);
  readonly waitingFor = input<PipelineRunFixture | undefined>(undefined);
  protected readonly text: RunText = inject(RunText);
  protected readonly actions: PipelineActions = inject(PipelineActions);
  protected readonly skeletonRows: number[] = [1, 2];

  protected short(run: PipelineRunFixture): string {
    return shortId(run.id);
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }
}

@Component({
  selector: 'ds-pipeline-history-table',
  imports: [CheckboxComponent, RunStatusComponent, TooltipDirective, TranslatePipe],
  template: `
    <table class="pipeline-grid" data-testid="pipelines-history-table" [attr.aria-label]="'pipelines.view.history' | t">
      <thead>
        <tr>
          <th class="col-check pipeline-select-cell">
            <ds-checkbox
              data-testid="pipelines-select-all"
              [checked]="allChecked()"
              [disabled]="!runs().length"
              (checkedChange)="store.checkLoaded($event)"
              ><span class="visually-hidden">{{ 'pipelines.selectAll' | t }}</span></ds-checkbox
            >
          </th>
          <th>{{ 'pipelines.col.pipeline' | t }}</th>
          <th class="col-status">{{ 'pipelines.col.status' | t }}</th>
          <th>{{ 'pipelines.col.result' | t }}</th>
          <th class="col-time num">{{ 'run.meta.finished' | t }}</th>
          <th class="col-number num">{{ 'run.meta.duration' | t }}</th>
        </tr>
      </thead>
      <tbody>
        @if (loading()) {
          @for (row of skeletonRows; track row) {
            <tr>
              <td></td>
              <td><div class="skeleton" style="width: var(--progress-w)"></div></td>
              <td><div class="skeleton" style="width: var(--home-tile-size)"></div></td>
              <td><div class="skeleton" style="width: var(--home-when-w)"></div></td>
              <td><div class="skeleton" style="width: var(--home-tile-size); margin-left: auto"></div></td>
              <td><div class="skeleton" style="width: var(--sp-xxl); margin-left: auto"></div></td>
            </tr>
          }
        } @else {
          @for (run of runs(); track run.id) {
            <tr
              data-testid="pipelines-history-row"
              tabindex="0"
              [attr.data-run-id]="run.id"
              [attr.data-status]="run.status"
              [attr.data-checked]="isChecked(run)"
              [attr.aria-current]="run.id === selectedId() ? 'true' : null"
              (click)="actions.select(run)"
              (keydown.enter)="actions.select(run)"
            >
              <td class="pipeline-select-cell" (click)="$event.stopPropagation()">
                <ds-checkbox
                  data-testid="pipelines-row-select"
                  [checked]="isChecked(run)"
                  (checkedChange)="store.toggleChecked(run.id, $event)"
                  ><span class="visually-hidden">{{
                    'pipelines.selectRun' | t: { name: text.name(run) }
                  }}</span></ds-checkbox
                >
              </td>
              <td class="pipeline-name" data-testid="pipelines-row-name">{{ text.name(run) }}</td>
              <td><ds-run-status [status]="run.status" /></td>
              <td
                class="pipeline-muted"
                data-testid="pipelines-row-result"
                [dsTooltip]="text.result(run)"
                dsTooltipWhenTruncated
              >
                {{ text.result(run) }}
              </td>
              <td class="num pipeline-muted" [dsTooltip]="run.finishedAt ? text.dateTime(run.finishedAt) : ''">
                {{ run.finishedAt ? text.shortDateTime(run.finishedAt) : '—' }}
              </td>
              <td class="num">{{ duration(run.seconds) }}</td>
            </tr>
          }
        }
      </tbody>
    </table>
  `,
})
class HistoryTableComponent {
  readonly runs = input.required<PipelineRunFixture[]>();
  readonly loading = input<boolean>(false);
  readonly selectedId = input<string | null>(null);
  protected readonly store: PipelinesPreviewStore = inject(PipelinesPreviewStore);
  protected readonly text: RunText = inject(RunText);
  protected readonly actions: PipelineActions = inject(PipelineActions);
  protected readonly skeletonRows: number[] = [1, 2, 3, 4];
  protected readonly allChecked = computed<boolean>(
    () => this.runs().length > 0 && this.runs().every((run) => this.store.checked().includes(run.id)),
  );

  protected isChecked(run: PipelineRunFixture): boolean {
    return this.store.checked().includes(run.id);
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }
}

@Component({
  selector: 'ds-pipeline-details',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    ProgressComponent,
    RunStatusComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  host: { class: 'pipeline-detail', 'data-testid': 'pipeline-details' },
  template: `
    <div class="pipeline-panel-head">
      <h2>{{ 'pipelines.detail.label' | t }}</h2>
      <span class="ds-spacer"></span>
      @if (run(); as run) {
        <div class="pipeline-detail-actions">
          <button
            dsBtn
            variant="ghost"
            size="sm"
            type="button"
            data-testid="pipeline-details-copy-id"
            [iconOnly]="true"
            [attr.aria-label]="'pipelines.action.copyId' | t"
            [dsTooltip]="'pipelines.action.copyId' | t"
            (click)="actions.copy(run.id, 'toast.idCopied')"
          >
            <ds-icon name="copy" size="sm" />
          </button>
          @if (active()) {
            <button
              dsBtn
              variant="ghost"
              size="sm"
              type="button"
              data-testid="pipeline-details-cancel"
              [attr.aria-label]="'pipelines.action.cancelRun' | t"
              [dsTooltip]="'pipelines.action.cancelRun' | t"
              (click)="actions.cancel(run)"
            >
              <ds-icon name="stop" size="sm" />{{ 'pipelines.action.cancel' | t }}
            </button>
          } @else {
            <button
              dsBtn
              variant="ghost"
              size="sm"
              type="button"
              data-testid="pipeline-details-delete"
              [iconOnly]="true"
              [attr.aria-label]="'pipelines.action.delete' | t"
              [dsTooltip]="'pipelines.action.delete' | t"
              (click)="remove(run)"
            >
              <ds-icon name="trash" size="sm" />
            </button>
          }
        </div>
      }
    </div>
    @if (run(); as run) {
      <div class="pipeline-detail-title">
        <h2 data-testid="pipeline-details-name">{{ text.name(run) }}</h2>
        <ds-run-status data-testid="pipeline-details-status" [status]="run.status" />
      </div>
      @switch (run.status) {
        @case ('failed') {
          <div class="pipeline-alert" data-kind="failed" data-testid="pipeline-details-error">
            <ds-icon name="alert-circle" />
            <strong>{{ 'run.failedAt' | t: { step: run.step, name: text.stepName(run.step) } }}</strong>
            <span>{{ text.error(run) }}</span>
            @if (run.errorCode === 'BACKEND_UNAVAILABLE') {
              <span class="pipeline-muted">{{ 'run.backendHint' | t }}</span>
            }
          </div>
        }
        @case ('cancelled') {
          <div class="pipeline-alert" data-kind="cancelled" data-testid="pipeline-details-error">
            <ds-icon name="stop" />
            <strong>{{ 'run.cancelledAt' | t: { step: run.step, name: text.stepName(run.step) } }}</strong>
            <span class="pipeline-muted">{{ text.cancelReason(run) }}</span>
          </div>
        }
      }
      @if (active()) {
        <section class="pipeline-detail-section">
          <h3>{{ 'run.progress' | t }}</h3>
          <div class="pipeline-run-progress">
            <ds-progress data-testid="pipeline-details-progress" [value]="run.progress" />
            <span class="num">{{ run.progress }}%</span>
          </div>
          <span class="pipeline-muted num" data-testid="pipeline-details-step">{{ progressText() }}</span>
        </section>
      }
      <section class="pipeline-detail-section">
        <h3>{{ 'run.steps' | t }}</h3>
        <ol class="pipeline-steps" data-testid="pipeline-details-steps">
          @for (step of stepViews(); track step.index) {
            <li
              data-testid="pipeline-details-step-item"
              [attr.data-state]="step.state"
              [attr.data-backend]="step.backend"
            >
              <ds-icon [name]="step.icon" size="sm" />
              <span class="pipeline-step-index num">{{ step.index }}</span>
              <span class="pipeline-step-name"
                >{{ step.name | t }}
                @if (step.backend) {
                  <span class="pipeline-tag" data-testid="pipeline-details-backend-tag"
                    ><ds-icon name="cpu" size="sm" />{{ 'run.tag.backend' | t }}</span
                  >
                }
              </span>
              <span class="pipeline-step-state">{{ step.label | t }}</span>
            </li>
          }
        </ol>
      </section>
      <section class="pipeline-detail-section">
        <h3>{{ 'pipelines.detail.properties' | t }}</h3>
        <dl class="ds-meta-list" data-testid="pipeline-details-meta">
          <dt>{{ 'run.meta.id' | t }}</dt>
          <dd class="pipeline-id">
            <code data-testid="pipeline-details-id" [dsTooltip]="run.id">{{ short(run) }}</code>
          </dd>
          <dt>{{ 'run.meta.type' | t }}</dt>
          <dd>{{ 'run.type.demo' | t }}</dd>
          <dt>{{ 'run.meta.started' | t }}</dt>
          <dd>{{ run.status === 'queued' ? '—' : text.dateTime(run.startedAt) }}</dd>
          <dt>{{ 'run.meta.finished' | t }}</dt>
          <dd>{{ run.finishedAt ? text.dateTime(run.finishedAt) : '—' }}</dd>
          <dt>{{ 'run.meta.duration' | t }}</dt>
          <dd>{{ run.status === 'queued' ? '—' : duration(run.seconds) }}</dd>
        </dl>
      </section>
    } @else if (missing()) {
      <ds-area-state
        kind="empty"
        compact
        data-testid="pipeline-details-not-found"
        [heading]="'run.notFound' | t"
        [description]="'run.notFoundDesc' | t"
      />
    } @else {
      <ds-area-state
        kind="empty"
        compact
        data-testid="pipeline-details-empty"
        [heading]="'pipelines.detail.emptyTitle' | t"
        [description]="'pipelines.detail.emptyDesc' | t"
      />
    }
  `,
})
class RunDetailsComponent {
  readonly run = input<PipelineRunFixture | undefined>(undefined);
  readonly missing = input<boolean>(false);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly router: Router = inject(Router);
  protected readonly text: RunText = inject(RunText);
  protected readonly actions: PipelineActions = inject(PipelineActions);

  protected readonly active = computed<boolean>(() => {
    const run: PipelineRunFixture | undefined = this.run();
    return !!run && isActive(run);
  });
  protected readonly stepViews = computed<StepView[]>(() => {
    const run: PipelineRunFixture | undefined = this.run();
    if (!run) return [];
    return DEMO_STEP_KEYS.map((name, index) => {
      const state: StepState = stepState(run, index + 1);
      return { index: index + 1, name, state, backend: index + 1 === DEMO_BACKEND_STEP, ...STEP_VIEWS[state] };
    });
  });
  protected readonly progressText = computed<string>(() => {
    const run: PipelineRunFixture | undefined = this.run();
    if (!run) return '';
    return run.status === 'queued' ? this.i18n.t('run.waiting') : this.text.step(run);
  });

  protected short(run: PipelineRunFixture): string {
    return shortId(run.id);
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }

  protected async remove(run: PipelineRunFixture): Promise<void> {
    if (await this.actions.remove([run.id])) void this.router.navigateByUrl('/pipelines');
  }
}

@Component({
  selector: 'ds-pipeline-log',
  imports: [ButtonDirective, CheckboxComponent, DotComponent, IconComponent, TooltipDirective, TranslatePipe],
  template: `
    <div class="pipeline-panel-head">
      <h2>{{ 'run.log.title' | t }}</h2>
      @if (run(); as run) {
        @if (run.status === 'running') {
          <span class="pipeline-status" data-status="running" data-testid="pipeline-log-live"
            ><ds-dot kind="primary" pulse />{{ 'run.log.live' | t }}</span
          >
        }
        <span class="pipeline-muted num" data-testid="pipeline-log-count">{{
          'run.log.lines' | t: { count: lines().length }
        }}</span>
        <span class="ds-spacer"></span>
        @if (run.status === 'running' || run.status === 'queued') {
          <ds-checkbox data-testid="pipeline-log-follow" [checked]="follow()" (checkedChange)="setFollow($event)">{{
            'run.log.follow' | t
          }}</ds-checkbox>
        }
        <button
          dsBtn
          variant="ghost"
          size="sm"
          type="button"
          data-testid="pipeline-log-copy"
          [iconOnly]="true"
          [disabled]="!lines().length"
          [attr.aria-label]="'run.log.copy' | t"
          [dsTooltip]="'run.log.copy' | t"
          (click)="actions.copy(rawLines().join('\\n'), 'toast.logCopied')"
        >
          <ds-icon name="copy" size="sm" />
        </button>
      }
    </div>
    @if (run(); as run) {
      <div
        #log
        class="pipeline-log"
        role="log"
        aria-live="off"
        tabindex="0"
        data-testid="pipeline-log"
        [attr.aria-label]="'run.log.label' | t"
        (scroll)="onScroll()"
      >
        @for (line of lines(); track $index) {
          <div class="pipeline-log-line" data-testid="pipeline-log-line" [attr.data-level]="line.level.trim()">
            <span>{{ line.time }}</span
            ><span class="level">{{ line.level }}</span
            ><span class="msg">{{ line.message }}</span>
          </div>
        } @empty {
          <span>{{ (run.status === 'queued' ? 'run.log.waitStart' : 'run.log.waitFirst') | t }}</span>
        }
      </div>
      @if (unseen() > 0) {
        <button
          dsBtn
          size="sm"
          type="button"
          class="pipeline-log-latest"
          data-testid="pipeline-log-latest"
          (click)="setFollow(true)"
        >
          <ds-icon name="arrow-down" size="sm" />{{ 'run.log.newLines' | t: { count: unseen() } }}
        </button>
      }
    } @else {
      <p class="pipeline-log-empty" data-testid="pipeline-log-select">{{ 'run.log.select' | t }}</p>
    }
  `,
})
class RunLogComponent {
  readonly run = input<PipelineRunFixture | undefined>(undefined);
  private readonly store: PipelinesPreviewStore = inject(PipelinesPreviewStore);
  private readonly logElement = viewChild<ElementRef<HTMLElement>>('log');
  private readonly text: RunText = inject(RunText);
  private readonly runId = computed<string | undefined>(() => this.run()?.id);
  private seenCount = 0;
  protected readonly actions: PipelineActions = inject(PipelineActions);

  protected readonly rawLines = computed<string[]>(() => {
    const id: string | undefined = this.runId();
    return id ? (this.store.logs()[id] ?? []) : [];
  });
  protected readonly lines = computed<LogLineView[]>(() => this.rawLines().map((raw) => this.text.logLine(raw)));
  protected readonly follow = signal<boolean>(true);
  protected readonly unseen = signal<number>(0);

  constructor() {
    afterNextRender(() => this.scrollToEnd());
    effect(() => {
      const id: string | undefined = this.runId();
      untracked(() => this.reset(id));
    });
    effect(() => {
      const count: number = this.rawLines().length;
      untracked(() => (this.follow() ? this.scrollToEnd() : this.unseen.set(count - this.seenCount)));
    });
  }

  protected setFollow(follow: boolean): void {
    this.follow.set(follow);
    if (follow) this.scrollToEnd();
  }

  protected onScroll(): void {
    const element: HTMLElement | undefined = this.logElement()?.nativeElement;
    if (!element) return;
    const atEnd: boolean = element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_END_PX;
    this.follow.set(atEnd);
    if (atEnd) this.markSeen();
  }

  private reset(id: string | undefined): void {
    this.follow.set(true);
    if (id) this.scrollToEnd();
  }

  private scrollToEnd(): void {
    requestAnimationFrame(() => {
      const element: HTMLElement | undefined = this.logElement()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
    this.markSeen();
  }

  private markSeen(): void {
    this.seenCount = this.rawLines().length;
    this.unseen.set(0);
  }
}

@Component({
  selector: 'ds-pipelines-preview-page',
  imports: [
    AreaStateComponent,
    BadgeComponent,
    ButtonDirective,
    DialogComponent,
    FieldComponent,
    HistoryTableComponent,
    IconComponent,
    PageTitleDirective,
    PillComponent,
    QueueTableComponent,
    RunDetailsComponent,
    RunLogComponent,
    SplitterDirective,
    TooltipDirective,
    TranslatePipe,
  ],
  host: { class: 'ds-page', 'data-testid': 'pipelines-page', '[attr.data-view]': 'store.view()' },
  template: `
    <div class="ds-page-toolbar" data-testid="page-toolbar">
      <h1 dsPageTitle>{{ 'nav.pipelines' | t }}</h1>
      <div class="pipeline-tabs" role="tablist" [attr.aria-label]="'pipelines.views' | t">
        @for (view of views; track view; let index = $index) {
          <button
            type="button"
            role="tab"
            class="pipeline-tab"
            aria-controls="pipelines-main"
            [attr.id]="'pipelines-tab-' + view"
            [attr.data-testid]="'pipelines-tab-' + view"
            [attr.aria-selected]="store.view() === view"
            [attr.tabindex]="store.view() === view ? 0 : -1"
            (click)="store.view.set(view)"
            (keydown.arrowRight)="moveTab(index, 1)"
            (keydown.arrowLeft)="moveTab(index, -1)"
          >
            @if (view === 'queue') {
              {{ 'pipelines.view.queue' | t }}
              @if (store.activeRuns().length) {
                <ds-badge data-testid="pipelines-tab-queue-count">{{ store.activeRuns().length }}</ds-badge>
              }
            } @else {
              {{ 'pipelines.view.history' | t }}
              @if (store.history().state === 'ready') {
                <span class="num" data-testid="pipelines-tab-history-count">{{ store.history().runs.length }}</span>
              }
            }
          </button>
        }
      </div>
      <div class="ds-page-actions">
        @if (store.view() === 'history' && store.history().state === 'ready' && store.history().runs.length) {
          <div class="pipeline-toolbar-group" data-testid="pipelines-filters">
            <span class="ds-select">
              <select
                class="ds-input"
                data-testid="pipelines-filter-status"
                [attr.aria-label]="'pipelines.filter.status' | t"
                (change)="store.setStatus($any($event.target).value)"
              >
                @for (option of statusOptions(); track option.value) {
                  <option [value]="option.value" [selected]="option.value === store.statusFilter()">
                    {{ option.label }}
                  </option>
                }
              </select>
              <ds-icon name="chevron-down" size="sm" />
            </span>
            <span class="ds-select">
              <select
                class="ds-input"
                data-testid="pipelines-filter-type"
                [attr.aria-label]="'pipelines.filter.type' | t"
                (change)="store.setType($any($event.target).value)"
              >
                @for (option of typeOptions(); track option.value) {
                  <option [value]="option.value" [selected]="option.value === store.typeFilter()">
                    {{ option.label }}
                  </option>
                }
              </select>
              <ds-icon name="chevron-down" size="sm" />
            </span>
            @if (store.filtered()) {
              <button
                dsBtn
                variant="ghost"
                size="sm"
                type="button"
                data-testid="pipelines-filter-clear"
                [iconOnly]="true"
                [attr.aria-label]="'pipelines.filter.clear' | t"
                [dsTooltip]="'pipelines.filter.clear' | t"
                (click)="store.clearFilters()"
              >
                <ds-icon name="x" size="sm" />
              </button>
            }
          </div>
          <span class="pipeline-toolbar-sep"></span>
          <div class="pipeline-toolbar-group">
            @if (store.checked().length) {
              <span class="pipeline-muted num" data-testid="pipelines-selection-count" aria-live="polite">{{
                'pipelines.selected' | t: { count: store.checked().length }
              }}</span>
            }
            <button
              dsBtn
              variant="ghost"
              size="sm"
              type="button"
              data-testid="pipelines-delete"
              [disabled]="!store.checked().length"
              (click)="deleteChecked()"
            >
              <ds-icon name="trash" size="sm" />{{ 'pipelines.action.delete' | t }}
            </button>
          </div>
          <span class="pipeline-toolbar-sep"></span>
        }
        @if (!store.packaged) {
          <button
            dsBtn
            variant="primary"
            size="sm"
            type="button"
            data-testid="pipelines-start"
            (click)="startOpen.set(true)"
          >
            <ds-icon name="play" size="sm" />{{ 'pipelines.start.title' | t }}
          </button>
        }
      </div>
    </div>

    <div class="pipeline-workbench">
      <div class="pipeline-center">
        <main
          id="pipelines-main"
          class="pipeline-main"
          role="tabpanel"
          data-testid="pipelines-main"
          [attr.aria-labelledby]="'pipelines-tab-' + store.view()"
        >
          @if (store.view() === 'queue') {
            @if (store.active().state === 'error') {
              <ds-area-state
                kind="error"
                compact
                [heading]="'home.running.error' | t"
                [detailsLabel]="'home.details' | t"
                [details]="store.active().error ?? ''"
              >
                <button dsBtn size="sm" type="button" data-testid="pipelines-queue-retry">
                  <ds-icon name="retry" size="sm" />{{ 'common.retry' | t }}
                </button>
              </ds-area-state>
            } @else {
              <ds-pipeline-queue-table
                [runs]="store.activeRuns()"
                [loading]="store.active().state === 'loading'"
                [selectedId]="selectedId()"
                [waitingFor]="store.runningRun()"
              />
              <div class="pipeline-grid-foot" data-testid="pipelines-queue-foot">
                @if (store.activeRuns().length) {
                  <span class="num" data-testid="pipelines-queue-counts">{{
                    'pipelines.active.counts' | t: { running: store.runningCount(), queued: store.queuedCount() }
                  }}</span>
                  <span>·</span>
                }
                <span data-testid="pipelines-concurrency-note">{{ 'pipelines.note.concurrency' | t }}</span>
              </div>
            }
          } @else {
            @switch (store.history().state) {
              @case ('error') {
                <ds-area-state
                  kind="error"
                  compact
                  [heading]="'pipelines.history.error' | t"
                  [detailsLabel]="'home.details' | t"
                  [details]="store.history().error ?? ''"
                >
                  <button dsBtn size="sm" type="button" data-testid="pipelines-history-retry">
                    <ds-icon name="retry" size="sm" />{{ 'common.retry' | t }}
                  </button>
                </ds-area-state>
              }
              @case ('loading') {
                <ds-pipeline-history-table [runs]="[]" [loading]="true" aria-busy="true" />
              }
              @default {
                @if (!store.history().runs.length) {
                  <ds-area-state
                    kind="empty"
                    compact
                    data-testid="pipelines-history-empty"
                    [heading]="'pipelines.history.emptyTitle' | t"
                    [description]="'pipelines.history.emptyDesc' | t"
                  />
                } @else if (!store.matchingRuns().length) {
                  <ds-area-state
                    kind="empty"
                    compact
                    data-testid="pipelines-history-no-match"
                    [heading]="'pipelines.history.noMatch' | t"
                  >
                    <button dsBtn size="sm" type="button" (click)="store.clearFilters()">
                      {{ 'pipelines.filter.clear' | t }}
                    </button>
                  </ds-area-state>
                } @else {
                  <ds-pipeline-history-table [runs]="store.loadedRuns()" [selectedId]="selectedId()" />
                  <div class="pipeline-grid-foot" data-testid="pipelines-history-footer">
                    <span class="num" data-testid="pipelines-history-shown">{{
                      'pipelines.history.shown'
                        | t: { shown: store.loadedRuns().length, total: store.matchingRuns().length }
                    }}</span>
                    @if (store.hasMore()) {
                      <button
                        dsBtn
                        size="sm"
                        type="button"
                        data-testid="pipelines-history-load-more"
                        [loading]="store.loadingMore()"
                        (click)="store.loadMore()"
                      >
                        {{ 'pipelines.history.loadMore' | t }}
                      </button>
                    }
                  </div>
                }
              }
            }
          }
        </main>
        <ds-splitter edge="bottom" [target]="bottom" [label]="'pipelines.resize.log' | t" />
        <aside
          #bottom
          class="ds-panel-bottom pipeline-log-panel"
          data-testid="pipeline-log-panel"
          [attr.aria-label]="'run.log.title' | t"
        >
          <ds-pipeline-log [run]="selectedRun()" />
        </aside>
      </div>

      <ds-splitter edge="right" [target]="right" [label]="'pipelines.resize.details' | t" />
      <aside
        #right
        class="ds-panel-right pipeline-details-panel"
        data-testid="pipelines-details-panel"
        [attr.aria-label]="'pipelines.detail.label' | t"
      >
        <ds-pipeline-details [run]="selectedRun()" [missing]="!!selectedId() && !selectedRun()" />
      </aside>
    </div>

    <ds-dialog
      data-testid="pipeline-start-dialog"
      icon="play"
      [heading]="'pipelines.start.title' | t"
      [closeLabel]="'common.dismiss' | t"
      [open]="startOpen()"
      (closed)="startOpen.set(false)"
    >
      <div class="pipeline-start-form">
        <p class="pipeline-start-note">
          <ds-pill>{{ 'pipelines.start.devOnly' | t }}</ds-pill
          >{{ 'pipelines.start.devNote' | t }}
        </p>
        <ds-field
          controlId="pipeline-start-type"
          [label]="'pipelines.start.type' | t"
          [hint]="'pipelines.start.typeHint' | t: { steps: stepKeys.length, step: backendStep }"
        >
          <span class="ds-select">
            <select id="pipeline-start-type" class="ds-input" autofocus data-testid="pipeline-start-type">
              <option value="demo">{{ 'run.type.demo' | t }}</option>
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
        <ds-field
          controlId="pipeline-start-fail"
          [label]="'pipelines.start.failAt' | t"
          [hint]="'pipelines.start.failAtHint' | t"
        >
          <span class="ds-select">
            <select
              id="pipeline-start-fail"
              class="ds-input"
              data-testid="pipeline-start-fail-step"
              (change)="failAt.set(+$any($event.target).value)"
            >
              <option value="0">{{ 'pipelines.start.failNever' | t }}</option>
              @for (key of stepKeys; track key; let index = $index) {
                <option [value]="index + 1">
                  {{ 'pipelines.start.failStep' | t: { step: index + 1, name: (key | t) } }}
                </option>
              }
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
        @if (store.runningRun(); as running) {
          <p class="pipeline-start-note" data-testid="pipeline-start-queue-note">
            <ds-icon name="info" size="sm" />{{ 'pipelines.start.queueNote' | t: { name: text.name(running) } }}
          </p>
        }
      </div>
      <ng-container dialogFooter>
        <button dsBtn type="button" data-testid="pipeline-start-cancel" (click)="startOpen.set(false)">
          {{ 'common.cancel' | t }}
        </button>
        <button dsBtn variant="primary" type="button" data-testid="pipeline-start-confirm" (click)="start()">
          <ds-icon name="play" size="sm" />{{ 'pipelines.start.confirm' | t }}
        </button>
      </ng-container>
    </ds-dialog>
  `,
})
class PipelinesPreviewPage {
  private readonly i18n: I18nService = inject(I18nService);
  private readonly actions: PipelineActions = inject(PipelineActions);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector: Injector = inject(Injector);
  protected readonly store: PipelinesPreviewStore = inject(PipelinesPreviewStore);
  protected readonly text: RunText = inject(RunText);

  protected readonly views: View[] = VIEWS;
  protected readonly stepKeys: string[] = DEMO_STEP_KEYS;
  protected readonly backendStep: number = DEMO_BACKEND_STEP;
  protected readonly startOpen = signal<boolean>(false);
  protected readonly failAt = signal<number>(0);
  protected readonly selectedId: Signal<string | null> = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null },
  );
  protected readonly selectedRun = computed<PipelineRunFixture | undefined>(() => {
    const id: string | null = this.selectedId();
    return id ? this.store.find(id) : undefined;
  });
  protected readonly statusOptions = computed<OptionView[]>(() => [
    { value: 'all', label: this.i18n.t('pipelines.filter.allStatuses') },
    { value: 'succeeded', label: this.i18n.t('run.succeeded') },
    { value: 'failed', label: this.i18n.t('run.failed') },
    { value: 'cancelled', label: this.i18n.t('run.cancelled') },
  ]);
  protected readonly typeOptions = computed<OptionView[]>(() => [
    { value: 'all', label: this.i18n.t('pipelines.filter.allTypes') },
    { value: DEMO_TYPE, label: this.i18n.t('run.type.demo') },
  ]);

  protected moveTab(index: number, step: number): void {
    const next: View = VIEWS[(index + step + VIEWS.length) % VIEWS.length];
    this.store.view.set(next);
    afterNextRender(() => this.host.querySelector<HTMLElement>(`#pipelines-tab-${next}`)?.focus(), {
      injector: this.injector,
    });
  }

  protected deleteChecked(): Promise<boolean> {
    return this.actions.remove(this.store.checked());
  }

  protected start(): void {
    const run: PipelineRunFixture = this.store.start(this.failAt());
    this.startOpen.set(false);
    this.store.view.set('queue');
    this.actions.select(run);
  }
}

@Component({
  selector: 'ds-pipelines-shell-demo',
  imports: [ShellComponent, ConfirmHostComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div><ds-confirm-host />',
})
class PipelinesShellDemoComponent implements OnInit {
  readonly route = input<string>('/pipelines');

  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

function previewRoutes(): Routes {
  const modules = MODULES.map((module) =>
    module.id === 'pipelines' ? { ...module, page: PipelinesPreviewPage } : module,
  );
  return [
    { path: 'pipelines/:id', component: PipelinesPreviewPage, data: { module: 'pipelines' } },
    ...buildRoutes(modules, ComingSoonPage),
  ];
}

function providePreview(preview: PipelinesPreview): Provider[] {
  return [
    { provide: PREVIEW, useValue: preview },
    { provide: ACTIVE_PIPELINES, useFactory: () => inject(PipelinesPreviewStore).activeSlot },
    { provide: RECENT_PIPELINES, useFactory: () => inject(PipelinesPreviewStore).recentSlot },
  ];
}

interface PipelinesArgs {
  route: string;
  preview: PipelinesPreview;
}

const DATA: PipelinesPreview = {
  active: { state: 'ready', runs: ACTIVE_RUNS },
  history: { state: 'ready', runs: LONG_HISTORY_RUNS },
};

const meta: Meta<PipelinesArgs> = {
  title: 'Pages/Pipelines',
  parameters: { layout: 'fullscreen' },
  args: { route: `/pipelines/${RUNNING_RUN.id}`, preview: { ...DATA, live: true } },
  decorators: [
    moduleMetadata({ imports: [PipelinesShellDemoComponent] }),
    (story, context) => {
      const result = story();
      const providers = [
        provideRouter(previewRoutes(), withHashLocation()),
        provideDesktopApi({ backend: 'running' }),
        ...providePreview(context.args.preview),
      ];
      return {
        ...result,
        applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
      };
    },
  ],
  render: (args) => ({
    props: args,
    template: '<ds-pipelines-shell-demo [route]="route" />',
  }),
};

export default meta;

type Story = StoryObj<PipelinesArgs>;

export const Main: Story = {};

export const Empty: Story = {
  args: {
    route: '/pipelines',
    preview: { active: { state: 'ready', runs: [] }, history: { state: 'ready', runs: [] }, packaged: true },
  },
};

export const Loading: Story = {
  args: {
    route: '/pipelines',
    preview: { active: { state: 'loading', runs: [] }, history: { state: 'loading', runs: [] } },
  },
};

export const ErrorState: Story = {
  name: 'Error',
  args: {
    route: '/pipelines',
    preview: {
      active: { state: 'error', runs: [], error: DB_ERROR },
      history: { state: 'error', runs: [], error: DB_ERROR },
    },
  },
};

export const RunNotFound: Story = {
  args: { route: '/pipelines/00000000-0000-4000-8000-000000000000', preview: DATA },
};
