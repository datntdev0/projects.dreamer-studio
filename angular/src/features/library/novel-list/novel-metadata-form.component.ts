import { afterNextRender } from '@angular/core';
import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import { viewChild } from '@angular/core';
import type { OnInit, Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { ChipInputComponent } from '@components/form/chip-input.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import type { NovelCoverPatch, NovelDetail, NovelPatch } from '@dreamer/shared/models/novel';
import type { PickedImage, Publication } from '@dreamer/shared/models/novel-package';
import { formatBytes } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LibraryStore } from '@core/stores/library-store';
import { coverPalette, coverUrl, languageOptions } from '../library-format';
import type { LanguageOption, RequiredField, TextField } from '../library-format';
import { LibraryCoverComponent } from './library-cover.component';

interface MetadataDraft {
  originalTitle: string;
  title: string;
  author: string;
  language: string;
  publication: Publication;
  tags: string[];
  description: string;
}

const REQUIRED_FIELDS: RequiredField[] = ['originalTitle', 'title', 'language'];
const FIELD_IDS: Record<RequiredField, string> = {
  originalTitle: 'insp-edit-original',
  title: 'insp-edit-display',
  language: 'insp-edit-language',
};

function toDraft(novel: NovelDetail): MetadataDraft {
  return {
    originalTitle: novel.originalTitle,
    title: novel.title,
    author: novel.author,
    language: novel.language,
    publication: novel.publication,
    tags: [...novel.tags],
    description: novel.description,
  };
}

@Component({
  selector: 'ds-novel-metadata-form',
  imports: [
    BannerComponent,
    ButtonDirective,
    ChipInputComponent,
    FieldComponent,
    IconComponent,
    LibraryCoverComponent,
    TranslatePipe,
  ],
  templateUrl: './novel-metadata-form.component.html',
})
export class NovelMetadataFormComponent implements OnInit {
  readonly novel = input.required<NovelDetail>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  private readonly chipInput = viewChild(ChipInputComponent);
  private readonly store: LibraryStore = inject(LibraryStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly initial = signal<MetadataDraft | null>(null);
  private readonly touched = signal<RequiredField[]>([]);
  private readonly picked = signal<PickedImage | null>(null);
  private readonly coverPatch = signal<NovelCoverPatch>('keep');
  private readonly coverError = signal<boolean>(false);

  protected readonly fieldIds: Record<RequiredField, string> = FIELD_IDS;
  protected readonly coverPalette = coverPalette;
  protected readonly draft = signal<MetadataDraft>({
    originalTitle: '',
    title: '',
    author: '',
    language: '',
    publication: 'ongoing',
    tags: [],
    description: '',
  });
  protected readonly saving = signal<boolean>(false);
  protected readonly refusedRun = signal<string | null>(null);
  readonly dirty: Signal<boolean> = computed(() => {
    const initial: MetadataDraft | null = this.initial();
    return (
      !!this.chipInput()?.pending() ||
      this.coverPatch() !== 'keep' ||
      (!!initial && JSON.stringify(initial) !== JSON.stringify(this.draft()))
    );
  });
  protected readonly errors: Signal<Record<RequiredField, boolean>> = computed(() => {
    const draft: MetadataDraft = this.draft();
    const touched: RequiredField[] = this.touched();
    const missing = (field: RequiredField): boolean => touched.includes(field) && !draft[field].trim();
    return { originalTitle: missing('originalTitle'), title: missing('title'), language: missing('language') };
  });
  protected readonly languages: Signal<LanguageOption[]> = computed(() =>
    languageOptions(this.draft().language, this.i18n.language()),
  );
  protected readonly cover: Signal<string | null> = computed(() => {
    const patch: NovelCoverPatch = this.coverPatch();
    if (typeof patch === 'object') return this.picked()?.previewUrl ?? null;
    if (patch === 'remove') return null;
    return coverUrl(this.novel());
  });
  protected readonly coverNoteKey: Signal<string> = computed(() => {
    if (typeof this.coverPatch() === 'object') return 'library.novel.form.coverPicked';
    if (this.coverPatch() === 'remove' || !this.novel().hasCover) return 'library.novel.form.coverNone';
    return 'library.novel.form.coverSaved';
  });
  protected readonly coverNoteParams: Signal<TranslateParams> = computed(() => ({
    name: this.picked()?.name ?? '',
    size: formatBytes(this.picked()?.size ?? 0, this.i18n.language()),
  }));

  constructor() {
    afterNextRender(() => this.focusField('originalTitle'));
  }

  ngOnInit(): void {
    const draft: MetadataDraft = toDraft(this.novel());
    this.initial.set(draft);
    this.draft.set({ ...draft, tags: [...draft.tags] });
  }

  protected setText(field: TextField, event: Event): void {
    const value: string = (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    this.update({ [field]: value });
  }

  protected setPublication(event: Event): void {
    this.update({ publication: (event.target as HTMLSelectElement).value as Publication });
  }

  protected setTags(tags: string[]): void {
    this.update({ tags });
  }

  protected touch(field: RequiredField): void {
    if (!this.touched().includes(field)) this.touched.update((fields: RequiredField[]) => [...fields, field]);
  }

  protected async changeCover(): Promise<void> {
    this.coverError.set(false);
    try {
      const image: PickedImage | null = await this.store.pickImage();
      if (!image) return;
      this.picked.set(image);
      this.coverPatch.set({ path: image.path });
    } catch (error: unknown) {
      if (isAppError(error) && error.code === ErrorCode.CoverInvalid) {
        this.coverError.set(true);
        return;
      }
      throw error;
    }
  }

  protected removeCover(): void {
    this.coverError.set(false);
    this.picked.set(null);
    this.coverPatch.set('remove');
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    this.chipInput()?.commit();
    this.touched.set(REQUIRED_FIELDS);
    const draft: MetadataDraft = this.draft();
    const invalid: RequiredField | undefined = REQUIRED_FIELDS.find((field: RequiredField) => !draft[field].trim());
    if (invalid) {
      this.focusField(invalid);
      return;
    }
    const patch: NovelPatch = {
      originalTitle: draft.originalTitle.trim(),
      title: draft.title.trim(),
      author: draft.author.trim(),
      language: draft.language.trim(),
      publication: draft.publication,
      tags: [...draft.tags],
      description: draft.description.trim(),
      cover: this.coverPatch(),
    };
    this.refusedRun.set(null);
    this.coverError.set(false);
    this.saving.set(true);
    try {
      await this.store.updateNovel(this.novel().id, patch);
      this.toast.show({
        kind: 'success',
        title: this.i18n.t('library.novel.form.saved', { title: patch.title ?? '' }),
      });
      this.saved.emit();
    } catch (error: unknown) {
      if (isAppError(error) && error.code === ErrorCode.NovelLocked) {
        this.refusedRun.set(error.details || this.novel().title);
        await this.store.reload();
      } else if (isAppError(error) && error.code === ErrorCode.CoverInvalid) {
        this.coverError.set(true);
      } else if (isAppError(error) && error.code === ErrorCode.NovelMetadataInvalid) {
        this.touched.set(REQUIRED_FIELDS);
      } else {
        throw error;
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected coverErrorText(): string {
    return this.coverError() ? this.i18n.t('errors.COVER_INVALID.message') : '';
  }

  protected canRemoveCover(): boolean {
    return this.coverPatch() !== 'remove' && (this.novel().hasCover || !!this.picked());
  }

  private focusField(field: RequiredField): void {
    this.host.querySelector<HTMLElement>(`#${FIELD_IDS[field]}`)?.focus();
  }

  private update(patch: Partial<MetadataDraft>): void {
    this.draft.set({ ...this.draft(), ...patch });
  }
}
