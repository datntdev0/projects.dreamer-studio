import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { NovelDetail, NovelPatch, NovelSummary } from '@dreamer/shared/models/novel';
import type { PickedImage } from '@dreamer/shared/models/novel-package';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import type { TranslationLanguageSummary } from '@dreamer/shared/models/translation';
import { formatCompact, formatCount, formatDateTime, shortId } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LibraryStore } from '@core/stores/library-store';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { PipelineStore } from '@core/stores/pipeline-store';
import { PipelineActions } from '../../pipelines/pipeline-actions';
import { coverPalette, coverUrl, languageName, translationLevel } from '../library-format';
import { LibraryCoverComponent } from './library-cover.component';
import { NovelMetadataFormComponent } from './novel-metadata-form.component';

@Component({
  selector: 'ds-library-inspector',
  imports: [
    ButtonDirective,
    IconComponent,
    LibraryCoverComponent,
    NovelMetadataFormComponent,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  host: { 'data-testid': 'library-inspector' },
  templateUrl: './library-inspector.component.html',
})
export class LibraryInspectorComponent {
  readonly novel = input.required<NovelSummary>();
  readonly open = output<string>();
  readonly delete = output<string>();
  private readonly form = viewChild(NovelMetadataFormComponent);
  private readonly store: LibraryStore = inject(LibraryStore);
  protected readonly currentNovel = inject(CurrentNovelStore);
  private readonly pipelines: PipelineStore = inject(PipelineStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  protected readonly actions: PipelineActions = inject(PipelineActions);
  protected readonly detail: WritableSignal<NovelDetail | null> = signal(null);
  protected readonly coverBusy = signal<boolean>(false);
  protected readonly exportBusy = signal<boolean>(false);
  private detailId: string | null = null;

  protected readonly coverUrl = coverUrl;
  protected readonly coverPalette = coverPalette;
  readonly editing = signal<boolean>(false);
  readonly dirty: Signal<boolean> = computed(() => this.editing() && (this.form()?.dirty() ?? false));
  protected readonly lockReason: Signal<string> = computed(() => {
    const lock = this.novel().lock;
    if (!lock) return '';
    const label: string = lock.label ?? this.i18n.t(`run.type.${lock.type}`);
    return this.i18n.t('library.inspector.locked', { label });
  });

  constructor() {
    effect((onCleanup: (cleanup: () => void) => void) => {
      const { id } = this.novel();
      if (this.detailId !== null && this.detailId !== id) this.editing.set(false);
      this.detailId = id;
      let stale = false;
      onCleanup(() => (stale = true));
      void this.store.detail(id).then((detail: NovelDetail | null) => {
        if (!stale) this.detail.set(detail);
      });
    });
  }

  discard(): void {
    this.editing.set(false);
  }

  protected synopsis(): string {
    const detail: NovelDetail | null = this.detail();
    return detail?.id === this.novel().id ? detail.description : '';
  }

  protected count(value: number): string {
    return formatCount(value, this.i18n.language());
  }

  protected compact(value: number): string {
    return formatCompact(value, this.i18n.language());
  }

  protected language(code: string): string {
    return languageName(code, this.i18n.language());
  }

  protected translationLine(item: TranslationLanguageSummary): string {
    return this.i18n.t('library.translation.status.inspLine', {
      language: this.language(item.language),
      translated: this.count(item.translated),
      total: this.count(item.total),
    });
  }

  protected readonly translationLevel = translationLevel;
  protected readonly shortId = shortId;

  protected date(iso: string): string {
    return formatDateTime(iso, this.i18n.language());
  }

  protected publicationKey(): string {
    return `library.browse.publication.${this.novel().publication}`;
  }

  protected startEditing(): void {
    if (!this.novel().lock && this.detail()?.id === this.novel().id) this.editing.set(true);
  }

  protected finishEditing(): void {
    this.editing.set(false);
  }

  protected async changeCover(): Promise<void> {
    if (this.coverBusy() || this.editing() || this.novel().lock) return;
    try {
      const image: PickedImage | null = await this.store.pickImage();
      if (!image) return;
      await this.updateCover({ cover: { path: image.path } });
    } catch (error: unknown) {
      await this.handleCoverError(error);
    }
  }

  protected async removeCover(): Promise<void> {
    if (this.coverBusy() || this.editing() || this.novel().lock || !this.novel().hasCover) return;
    try {
      await this.updateCover({ cover: 'remove' });
    } catch (error: unknown) {
      await this.handleCoverError(error);
    }
  }

  protected async exportNovel(): Promise<void> {
    if (this.exportBusy()) return;
    this.exportBusy.set(true);
    try {
      const run: PipelineRun | null = await this.store.exportNovel(this.novel().id);
      if (run) this.notifyExportStarted(run);
    } catch (error: unknown) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('library.inspector.exportFailed'),
        message: errorMessage(error),
      });
    } finally {
      this.exportBusy.set(false);
    }
  }

  protected async openFolder(): Promise<void> {
    try {
      await this.store.openFolder(this.novel().id);
    } catch {
      this.toast.show({ kind: 'danger', title: this.i18n.t('library.inspector.openFolderFailed') });
    }
  }

  private notifyExportStarted(run: PipelineRun): void {
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('toast.export.started', { title: run.label ?? this.novel().title }),
      message: this.i18n.t('toast.export.startedMsg'),
      action: { label: this.i18n.t('toast.export.view'), run: () => this.pipelines.openPipeline(run.id) },
    });
  }

  private async updateCover(patch: NovelPatch): Promise<void> {
    this.coverBusy.set(true);
    try {
      const updated: NovelDetail | null = await this.store.updateNovel(this.novel().id, patch);
      if (updated) this.detail.set(updated);
    } finally {
      this.coverBusy.set(false);
    }
  }

  private async handleCoverError(error: unknown): Promise<void> {
    if (isAppError(error) && (error.code === ErrorCode.CoverInvalid || error.code === ErrorCode.NovelLocked)) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t(`errors.${error.code}.title`),
        message: this.i18n.t(`errors.${error.code}.message`),
      });
      if (error.code === ErrorCode.NovelLocked) await this.store.reload();
      return;
    }
    throw error;
  }
}
