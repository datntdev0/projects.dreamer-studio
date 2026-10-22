import { afterNextRender } from '@angular/core';
import { booleanAttribute } from '@angular/core';
import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import type { Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { formatBytes } from '../../../core/format';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { languageOptions, sameDraft, toDraft } from '../library-format';
import type { CoverError } from '../library.models';
import type { CoverSample } from '../library.models';
import type { LanguageOption } from '../library.models';
import type { LibraryNovel } from '../library.models';
import type { NovelDraft } from '../library.models';
import type { RequiredField } from '../library.models';
import type { TextField } from '../library.models';
import { LibraryStore } from '../library.store';
import { LibraryCoverComponent } from './library-cover.component';

const MB: number = 1024 * 1024;
const COVER_MAX_BYTES: number = 10 * MB;
const COVER_TYPES: string[] = ['image/jpeg', 'image/png'];
const REQUIRED_FIELDS: RequiredField[] = ['originalTitle', 'title', 'language'];
const FIELD_IDS: Record<RequiredField, string> = {
  originalTitle: 'novel-page-form-original-title',
  title: 'novel-page-form-title',
  language: 'novel-page-form-language',
};

@Component({
  selector: 'ds-novel-metadata-form',
  host: { '[class.library-novel-form-compact]': 'compact()' },
  imports: [
    BannerComponent,
    ButtonDirective,
    DialogComponent,
    FieldComponent,
    IconComponent,
    LibraryCoverComponent,
    PillComponent,
    TranslatePipe,
  ],
  templateUrl: './novel-metadata-form.component.html',
})
export class NovelMetadataFormComponent implements OnInit {
  readonly novel = input.required<LibraryNovel>();
  readonly done = output<void>();
  readonly cancelled = output<void>();
  readonly compact = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected readonly fieldIds: Record<RequiredField, string> = FIELD_IDS;
  protected readonly draft = signal<NovelDraft>({
    originalTitle: '',
    title: '',
    author: '',
    description: '',
    language: '',
    tags: [],
    cover: null,
    publication: 'completed',
  });
  protected readonly tagDraft = signal<string>('');
  protected readonly pickerOpen = signal<boolean>(false);
  protected readonly picked = signal<CoverSample | null>(null);
  protected readonly coverError = signal<CoverError | null>(null);
  protected readonly refusedRun = signal<string | null>(null);
  private readonly saved = signal<NovelDraft | null>(null);
  private readonly touched = signal<RequiredField[]>([]);

  private readonly store: LibraryStore = inject(LibraryStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly dirty: Signal<boolean> = computed(() => {
    const saved: NovelDraft | null = this.saved();
    return !!this.tagDraft().trim() || (!!saved && !sameDraft(saved, this.draft()));
  });

  protected readonly errors: Signal<Record<RequiredField, boolean>> = computed(() => {
    const draft: NovelDraft = this.draft();
    const touched: RequiredField[] = this.touched();
    const missing = (field: RequiredField): boolean => touched.includes(field) && !draft[field].trim();
    return { originalTitle: missing('originalTitle'), title: missing('title'), language: missing('language') };
  });

  protected readonly coverErrorText: Signal<string> = computed(() => {
    const error: CoverError | null = this.coverError();
    return error ? this.i18n.t(error.key, error.params) : '';
  });

  protected readonly languages: Signal<LanguageOption[]> = computed(() => languageOptions(this.draft().language));

  protected readonly coverNoteKey: Signal<string> = computed(() => {
    if (this.picked() && this.draft().cover) return 'library.novel.form.coverPicked';
    return this.draft().cover ? 'library.novel.form.coverSaved' : 'library.novel.form.coverNone';
  });

  protected readonly coverNoteParams: Signal<TranslateParams> = computed(() => ({
    name: this.picked()?.name ?? '',
    size: this.size(this.picked()?.size ?? 0),
  }));

  protected readonly samples: Signal<CoverSample[]> = computed(() => {
    const covers: string[] = this.store
      .novels()
      .map((novel: LibraryNovel): string | null => novel.cover)
      .filter((cover: string | null): cover is string => !!cover);
    return [
      { name: 'cover-front.jpg', size: 1.2 * MB, type: 'image/jpeg', url: covers[0] ?? null },
      { name: 'cover-alt.png', size: 0.8 * MB, type: 'image/png', url: covers[1] ?? covers[0] ?? null },
      { name: 'scan-600dpi.png', size: 14.6 * MB, type: 'image/png', url: covers[0] ?? null },
      { name: 'notes.txt', size: 0.01 * MB, type: 'text/plain', url: null },
    ];
  });

  constructor() {
    afterNextRender(() => this.focusField('originalTitle'));
  }

  ngOnInit(): void {
    const draft: NovelDraft = toDraft(this.novel(), this.i18n.language());
    this.saved.set(draft);
    this.draft.set({ ...draft, tags: [...draft.tags] });
  }

  protected setText(field: TextField, event: Event): void {
    const value: string = (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    this.update({ [field]: value });
  }

  protected setPublication(event: Event): void {
    this.update({ publication: (event.target as HTMLSelectElement).value as 'ongoing' | 'completed' });
  }

  protected cancel(): void {
    this.cancelled.emit();
    this.done.emit();
  }

  protected touch(field: RequiredField): void {
    if (!this.touched().includes(field)) this.touched.update((fields: RequiredField[]) => [...fields, field]);
  }

  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitTags();
    } else if (event.key === 'Backspace' && !this.tagDraft()) {
      const tags: string[] = this.draft().tags;
      if (tags.length) this.removeTag(tags[tags.length - 1]);
    }
  }

  protected commitTags(): void {
    const tags: string[] = [...this.draft().tags];
    for (const part of this.tagDraft().split(',')) {
      const tag: string = part.trim();
      const exists: boolean = tags.some((item: string): boolean => item.toLowerCase() === tag.toLowerCase());
      if (tag && !exists) tags.push(tag);
    }
    this.tagDraft.set('');
    if (tags.length !== this.draft().tags.length) this.update({ tags });
  }

  protected removeTag(tag: string): void {
    this.update({ tags: this.draft().tags.filter((item: string): boolean => item !== tag) });
  }

  protected chooseCover(sample: CoverSample): void {
    this.pickerOpen.set(false);
    const params: TranslateParams = {
      name: sample.name,
      size: this.size(sample.size),
      max: this.size(COVER_MAX_BYTES),
    };
    if (sample.size > COVER_MAX_BYTES) {
      this.coverError.set({ key: 'library.novel.form.coverTooLarge', params });
    } else if (!COVER_TYPES.includes(sample.type) || !sample.url) {
      this.coverError.set({ key: 'library.novel.form.coverNotImage', params });
    } else {
      this.coverError.set(null);
      this.picked.set(sample);
      this.update({ cover: sample.url });
    }
  }

  protected removeCover(): void {
    this.coverError.set(null);
    this.picked.set(null);
    this.update({ cover: null });
  }

  protected size(bytes: number): string {
    return formatBytes(bytes, this.i18n.language());
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.commitTags();
    this.touched.set(REQUIRED_FIELDS);
    const draft: NovelDraft = this.draft();
    const invalid: RequiredField | undefined = REQUIRED_FIELDS.find((field: RequiredField) => !draft[field].trim());
    if (invalid) {
      this.focusField(invalid);
      return;
    }
    const patch: NovelDraft = {
      ...draft,
      originalTitle: draft.originalTitle.trim(),
      title: draft.title.trim(),
      author: draft.author.trim(),
      description: draft.description.trim(),
    };
    const descriptionPatch: Partial<LibraryNovel> =
      this.i18n.language() === 'vi' ? { descriptionVi: patch.description } : { description: patch.description };
    if (
      this.store.updateNovel(this.novel().id, {
        ...patch,
        description: this.i18n.language() === 'vi' ? this.novel().description : patch.description,
        ...descriptionPatch,
      }) === 'locked'
    ) {
      this.refusedRun.set(this.novel().lock?.runLabel ?? this.novel().originalTitle);
      return;
    }
    this.saved.set(patch);
    this.toast.show({ kind: 'success', title: this.i18n.t('library.novel.form.saved', { title: patch.title }) });
    this.done.emit();
  }

  private focusField(field: RequiredField): void {
    this.host.querySelector<HTMLElement>(`#${FIELD_IDS[field]}`)?.focus();
  }

  private update(patch: Partial<NovelDraft>): void {
    this.draft.set({ ...this.draft(), ...patch });
  }
}
