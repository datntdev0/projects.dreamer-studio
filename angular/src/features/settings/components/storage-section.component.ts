import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { DialogComponent } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { PillComponent } from '@components/status/pill.component';
import type { PillKind } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { MISSING } from '@dreamer/shared/models/about';
import type { AppDataCandidate, AppDataContent, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { AppInfoStore } from '@core/app-info';
import { DesktopApi } from '@core/desktop-api';
import { formatTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';

type StepState = 'done' | 'running' | 'pending' | 'failed';
type DbStepId = 'dbOpen' | 'dbCreate' | 'dbUpgrade';
type SwitchableContent = Exclude<AppDataContent, 'newer'>;

interface SwitchStep {
  id: string;
  label: string;
  state: StepState;
}

interface Review {
  path: string;
  candidate: AppDataCandidate | null;
  errorKey: string | null;
}

interface ReviewView {
  dbStep: DbStepId | null;
  pill: string;
  pillKind: PillKind;
  message: string;
  params: TranslateParams;
}

interface StatusPart {
  key: string;
  params?: TranslateParams;
}

const STEP_LABELS: Record<string, string> = {
  close: 'settings.storage.switch.step.close',
  folders: 'settings.storage.switch.step.folders',
  dbOpen: 'settings.storage.switch.step.dbOpen',
  dbCreate: 'settings.storage.switch.step.dbCreate',
  dbUpgrade: 'settings.storage.switch.step.dbUpgrade',
  backend: 'settings.storage.switch.step.backend',
  rollback: 'settings.storage.switch.step.rollback',
};
const BYTES_PER_GB = 1024 ** 3;
const ROLLBACK_ID = 'rollback';
const UNEXPECTED_KEY = `errors.${ErrorCode.UiUnexpected}.message`;

const STEP_ICONS: Record<StepState, string> = {
  done: 'check',
  running: '',
  pending: 'minus',
  failed: 'alert-circle',
};

const STATE_LABELS: Record<StepState, string> = {
  done: 'settings.storage.switch.state.done',
  running: 'settings.storage.switch.state.running',
  pending: 'settings.storage.switch.state.pending',
  failed: 'settings.storage.switch.state.failed',
};

const DB_STEPS: Record<SwitchableContent, DbStepId> = { current: 'dbOpen', none: 'dbCreate', older: 'dbUpgrade' };

const CONTENT_VIEWS: Record<SwitchableContent, Pick<ReviewView, 'pill' | 'pillKind' | 'message'>> = {
  current: {
    pill: 'settings.storage.review.existing',
    pillKind: 'success',
    message: 'settings.storage.review.existingMsg',
  },
  older: { pill: 'settings.storage.review.older', pillKind: 'warning', message: 'settings.storage.review.olderMsg' },
  none: { pill: 'settings.storage.review.empty', pillKind: 'info', message: 'settings.storage.review.emptyMsg' },
};

function errorView(message: string, params: TranslateParams = {}): ReviewView {
  return { dbStep: null, pill: '', pillKind: 'danger', message, params };
}

function reviewView(review: Review): ReviewView {
  const candidate: AppDataCandidate | null = review.candidate;
  if (!candidate) return errorView(review.errorKey ?? UNEXPECTED_KEY);
  if (!candidate.writable) return errorView('settings.storage.error.notWritable');
  if (candidate.content === 'newer') {
    return errorView('settings.storage.error.newer', {
      found: candidate.foundVersion ?? '',
      supported: candidate.supportedVersion,
    });
  }
  return { ...CONTENT_VIEWS[candidate.content], dbStep: DB_STEPS[candidate.content], params: {} };
}

function errorCodeKey(error: unknown, part: 'title' | 'message'): string {
  return `errors.${isAppError(error) ? error.code : ErrorCode.UiUnexpected}.${part}`;
}

function failureKey(error: unknown): string {
  const code: string | null = isAppError(error) ? error.code : null;
  if (code === ErrorCode.DbMigrationFailed) return 'settings.storage.error.upgradeFailed';
  if (code === ErrorCode.AppDataUnwritable) return 'settings.storage.error.notWritable';
  return errorCodeKey(error, 'title');
}

@Component({
  selector: 'ds-settings-storage',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonDirective,
    DialogComponent,
    DotComponent,
    IconComponent,
    PillComponent,
    ProgressComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './storage-section.component.html',
})
export class StorageSectionComponent {
  private readonly api: DesktopApi = inject(DesktopApi);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly store: SettingsStore = inject(SettingsStore);
  private readonly appInfo: AppInfoStore = inject(AppInfoStore);
  private readonly pipelines: PipelineStore = inject(PipelineStore);
  private readonly injector: Injector = inject(Injector);
  private stopProgress: (() => void) | null = null;

  protected readonly settingsDir: Signal<string> = computed(() => this.appInfo.info()?.settingsDir ?? MISSING);
  protected readonly stateLabels: Record<StepState, string> = STATE_LABELS;
  protected readonly stepIcons: Record<StepState, string> = STEP_ICONS;

  protected readonly appDataDir: Signal<string> = computed(() => this.store.settings()?.appDataDir ?? '');
  protected readonly status = signal<AppDataStatus | null>(null);
  protected readonly checking = signal<boolean>(false);
  protected readonly review = signal<Review | null>(null);
  protected readonly switchTarget = signal<string | null>(null);
  protected readonly steps = signal<SwitchStep[]>([]);
  protected readonly switchError = signal<string | null>(null);

  protected readonly defaultDir: Signal<string> = computed(() => this.store.state()?.defaultAppDataDir ?? '');
  protected readonly isDefault: Signal<boolean> = computed(
    () => this.appDataDir().toLowerCase() === this.defaultDir().toLowerCase(),
  );
  protected readonly activeCount: Signal<number> = computed(() => this.pipelines.active().runs.length);
  protected readonly blocked: Signal<boolean> = computed(() => this.activeCount() > 0);
  protected readonly resetTooltip: Signal<string> = computed(() => {
    if (this.blocked()) return this.i18n.t('settings.storage.blocked.message', { count: this.activeCount() });
    return this.isDefault() ? this.i18n.t('settings.storage.resetDisabled') : '';
  });
  protected readonly reviewView: Signal<ReviewView | null> = computed(() => {
    const review: Review | null = this.review();
    return review ? reviewView(review) : null;
  });
  protected readonly statusParts: Signal<StatusPart[]> = computed(() => this.buildStatusParts(this.status()));
  protected readonly switchProgress: Signal<number> = computed(() => {
    const steps: SwitchStep[] = this.steps();
    const done: number = steps.filter((step) => step.state === 'done').length;
    return steps.length ? (done / steps.length) * 100 : 0;
  });

  private readonly switchClose = viewChild<ElementRef<HTMLButtonElement>>('switchClose');

  constructor() {
    void this.loadStatus();
    inject(DestroyRef).onDestroy(() => this.stopProgress?.());
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.appDataDir());
      this.toast.show({ kind: 'success', title: this.i18n.t('settings.storage.copied') });
    } catch {
      this.toast.show({ kind: 'danger', title: this.i18n.t('settings.storage.copyFailed') });
    }
  }

  protected async openExplorer(): Promise<void> {
    try {
      await this.api.openDataDir();
    } catch (error) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('settings.storage.openExplorerFailed'),
        message: errorMessage(error),
      });
    }
  }

  protected async pick(): Promise<void> {
    const path: string | null = await this.api.pickAppDataFolder();
    if (!path) return;
    const review: Review | null = await this.check(path);
    if (review) this.review.set(review);
  }

  protected chooseAnother(): void {
    this.review.set(null);
    void this.pick();
  }

  protected confirmReview(): void {
    const review: Review | null = this.review();
    this.review.set(null);
    if (review?.candidate) void this.runSwitch(review.path, review.candidate.content as SwitchableContent);
  }

  protected async reset(): Promise<void> {
    const path: string = this.defaultDir();
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('settings.storage.resetConfirm.title'),
      message: this.i18n.t('settings.storage.resetConfirm.message', { path }),
      confirmLabel: this.i18n.t('settings.storage.resetConfirm.confirm'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (!confirmed) return;
    const review: Review | null = await this.check(path);
    if (!review) return;
    if (review.candidate && reviewView(review).dbStep) {
      await this.runSwitch(path, review.candidate.content as SwitchableContent);
    } else {
      this.review.set(review);
    }
  }

  private async check(path: string): Promise<Review | null> {
    this.checking.set(true);
    try {
      const candidate: AppDataCandidate | null = await this.api.inspectAppData(path);
      if (!candidate) return null;
      if (candidate.current) {
        this.toastSame();
        return null;
      }
      return { path, candidate, errorKey: null };
    } catch (error) {
      return { path, candidate: null, errorKey: errorCodeKey(error, 'message') };
    } finally {
      this.checking.set(false);
    }
  }

  private toastSame(): void {
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('settings.storage.same'),
      message: this.i18n.t('settings.storage.sameMsg'),
      autoHide: true,
    });
  }

  private async runSwitch(path: string, content: SwitchableContent): Promise<void> {
    const dbStep: DbStepId = DB_STEPS[content];
    const ids: string[] = ['close', 'folders', dbStep, 'backend'];
    this.steps.set(ids.map((id) => ({ id, label: STEP_LABELS[id], state: 'pending' })));
    this.switchError.set(null);
    this.switchTarget.set(path);
    this.stopProgress = this.api.onAppDataProgress((step) => this.onProgress(step, dbStep));
    try {
      await this.api.switchAppData(path);
      this.finishSwitch(path);
    } catch (error) {
      this.failSwitch(error);
    } finally {
      this.stopProgress?.();
      this.stopProgress = null;
    }
  }

  private onProgress(step: AppDataStep, dbStep: DbStepId): void {
    if (step === 'rollback') {
      this.steps.update((steps) => [
        ...steps.map((item) => (item.state === 'running' ? { ...item, state: 'failed' as const } : item)),
        { id: ROLLBACK_ID, label: STEP_LABELS[ROLLBACK_ID], state: 'running' },
      ]);
      return;
    }
    const id: string = step === 'database' ? dbStep : step;
    const current: number = this.steps().findIndex((item) => item.id === id);
    this.steps.update((steps) =>
      steps.map((item, index) => {
        if (index < current) return { ...item, state: 'done' as const };
        return index === current ? { ...item, state: 'running' as const } : item;
      }),
    );
  }

  private finishSwitch(path: string): void {
    this.steps.update((steps) => steps.map((item) => ({ ...item, state: 'done' as const })));
    this.switchTarget.set(null);
    void this.loadStatus();
    this.toast.show({
      kind: 'success',
      title: this.i18n.t('settings.storage.switched', { path }),
      message: this.i18n.t('settings.storage.switchedMsg'),
    });
  }

  private failSwitch(error: unknown): void {
    this.steps.update((steps) =>
      steps.map((item) => {
        if (item.id === ROLLBACK_ID) return { ...item, state: 'done' as const };
        return item.state === 'running' ? { ...item, state: 'failed' as const } : item;
      }),
    );
    this.switchError.set(failureKey(error));
    afterNextRender(() => this.switchClose()?.nativeElement.focus(), { injector: this.injector });
  }

  private async loadStatus(): Promise<void> {
    try {
      this.status.set(await this.api.appDataStatus());
    } catch (error) {
      this.api.writeLog({ level: 'error', module: 'settings', message: errorMessage(error) });
    }
  }

  private buildStatusParts(status: AppDataStatus | null): StatusPart[] {
    if (!status) return [];
    const parts: StatusPart[] = [];
    if (status.freeBytes !== null) {
      const size: number = Math.round((status.freeBytes / BYTES_PER_GB) * 10) / 10;
      parts.push({ key: 'settings.storage.status.free', params: { size } });
    }
    parts.push({ key: status.writable ? 'settings.storage.status.readWrite' : 'settings.storage.status.notWritable' });
    if (status.schemaVersion !== null) {
      parts.push({ key: 'settings.storage.status.database', params: { version: status.schemaVersion } });
    }
    const time: string = formatTime(status.checkedAt, this.i18n.language());
    parts.push({ key: 'settings.storage.status.checked', params: { time } });
    return parts;
  }
}
