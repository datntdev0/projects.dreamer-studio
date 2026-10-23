import { Component, OnInit, computed, inject, signal, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import type { ImportCoverChoice, ImportMetadata } from '@dreamer/shared/models/novel-package';
import type { PackageCover, PickedImage } from '@dreamer/shared/models/novel-package';
import { formatBytes } from '../../../../core/format';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { ImportStore } from '../import.store';

type RequiredField = 'originalTitle' | 'title' | 'language';
type TextField = RequiredField | 'author' | 'description';

interface LanguageOption {
  code: string;
  label: string;
}

interface CoverView {
  name: string;
  size: number;
  source: 'package' | 'chosen';
  url: string | null;
}

const REQUIRED_FIELDS: RequiredField[] = ['originalTitle', 'title', 'language'];
const LANGUAGE_OPTIONS: string[] = ['zh', 'ja', 'ko', 'en', 'vi'];
const VERTICAL_LANGUAGES: string[] = ['zh', 'ja'];

@Component({
  selector: 'ds-import-metadata',
  imports: [ButtonDirective, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './import-metadata.component.html',
})
export class ImportMetadataComponent implements OnInit {
  protected readonly store: ImportStore = inject(ImportStore);
  protected readonly tagDraft = signal<string>('');
  private readonly touched = signal<RequiredField[]>([]);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly current: Signal<ImportMetadata> = computed(() => {
    const metadata: ImportMetadata | null = this.store.metadata();
    if (metadata) return metadata;
    return {
      originalTitle: '',
      title: '',
      author: '',
      description: '',
      tags: [],
      language: '',
      publication: 'ongoing',
    };
  });
  protected readonly errors: Signal<Record<RequiredField, boolean>> = computed(() => {
    const metadata: ImportMetadata = this.current();
    const touched: RequiredField[] = this.touched();
    const isMissing: (field: RequiredField) => boolean = (field: RequiredField): boolean =>
      touched.includes(field) && !metadata[field].trim();
    return { originalTitle: isMissing('originalTitle'), title: isMissing('title'), language: isMissing('language') };
  });
  protected readonly languageOptions: Signal<LanguageOption[]> = computed(() => {
    const names: Intl.DisplayNames = new Intl.DisplayNames([this.i18n.language()], { type: 'language' });
    const current: string = this.current().language;
    const codes: string[] =
      current && !LANGUAGE_OPTIONS.includes(current) ? [...LANGUAGE_OPTIONS, current] : LANGUAGE_OPTIONS;
    return codes.map((code: string): LanguageOption => ({ code, label: `${names.of(code) ?? code} · ${code}` }));
  });
  protected readonly verticalTitle: Signal<boolean> = computed(() =>
    VERTICAL_LANGUAGES.includes(this.current().language.split('-')[0]),
  );
  protected readonly cover: Signal<CoverView | null> = computed(() => {
    const choice: ImportCoverChoice = this.store.cover();
    if (choice.kind === 'file') {
      const file: PickedImage | null = this.store.coverFile();
      return file ? { name: file.name, size: file.size, source: 'chosen', url: null } : null;
    }
    if (choice.kind === 'package') {
      const cover: PackageCover | null | undefined = this.store.preview()?.cover;
      return cover ? { name: cover.file, size: cover.size, source: 'package', url: cover.url } : null;
    }
    return null;
  });

  ngOnInit(): void {
    const metadata: ImportMetadata = this.current();
    this.touched.set(REQUIRED_FIELDS.filter((field: RequiredField): boolean => !metadata[field].trim()));
  }

  protected setText(field: TextField, event: Event): void {
    const value: string = (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    this.store.updateMetadata({ [field]: value });
    if (field === 'language') this.touch('language');
  }

  protected touch(field: RequiredField): void {
    if (!this.touched().includes(field)) this.touched.update((fields: RequiredField[]) => [...fields, field]);
  }

  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitTags();
    } else if (event.key === 'Backspace' && !this.tagDraft()) {
      const tags: string[] = this.current().tags;
      if (tags.length) this.removeTag(tags[tags.length - 1]);
    }
  }

  protected onTagPaste(event: ClipboardEvent): void {
    const text: string = event.clipboardData?.getData('text') ?? '';
    if (!text) return;
    event.preventDefault();
    this.addTags(text);
  }

  protected commitTags(): void {
    this.addTags(this.tagDraft());
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.store.updateMetadata({ tags: this.current().tags.filter((item: string): boolean => item !== tag) });
  }

  protected chooseCover(): void {
    void this.store.chooseCover();
  }

  protected removeCover(): void {
    this.store.removeCover();
  }

  protected coverSize(cover: CoverView): string {
    return formatBytes(cover.size, this.i18n.language());
  }

  protected coverMetaKey(cover: CoverView): string {
    return cover.source === 'package'
      ? 'library.import.metadata.coverFromPackage'
      : 'library.import.metadata.coverChosen';
  }

  private addTags(value: string): void {
    const tags: string[] = [...this.current().tags];
    for (const part of value.split(/[,\r\n]+/)) {
      const tag: string = part.trim();
      const exists: boolean = tags.some(
        (item: string): boolean => item.toLocaleLowerCase() === tag.toLocaleLowerCase(),
      );
      if (tag && !exists) tags.push(tag);
    }
    if (tags.length !== this.current().tags.length) this.store.updateMetadata({ tags });
  }
}
