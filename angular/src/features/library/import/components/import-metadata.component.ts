import { Component, OnInit, computed, inject, signal, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { ChipInputComponent } from '@components/form/chip-input.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import type { ImportCoverChoice, ImportMetadata } from '@dreamer/shared/models/novel-package';
import type { PackageCover, PickedImage } from '@dreamer/shared/models/novel-package';
import { formatBytes } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { languageOptions } from '../../library-format';
import type { LanguageOption, RequiredField, TextField } from '../../library-format';
import { ImportStore } from '../import.store';

interface CoverView {
  name: string;
  size: number;
  source: 'package' | 'chosen';
  url: string | null;
}

const REQUIRED_FIELDS: RequiredField[] = ['originalTitle', 'title', 'language'];
const VERTICAL_LANGUAGES: string[] = ['zh', 'ja'];

@Component({
  selector: 'ds-import-metadata',
  imports: [ButtonDirective, ChipInputComponent, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './import-metadata.component.html',
})
export class ImportMetadataComponent implements OnInit {
  protected readonly store: ImportStore = inject(ImportStore);
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
  protected readonly languages: Signal<LanguageOption[]> = computed(() =>
    languageOptions(this.current().language, this.i18n.language()),
  );
  protected readonly verticalTitle: Signal<boolean> = computed(() =>
    VERTICAL_LANGUAGES.includes(this.current().language.split('-')[0]),
  );
  protected readonly cover: Signal<CoverView | null> = computed(() => {
    const choice: ImportCoverChoice = this.store.cover();
    if (choice.kind === 'file') {
      const file: PickedImage | null = this.store.coverFile();
      return file ? { name: file.name, size: file.size, source: 'chosen', url: file.previewUrl } : null;
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
}
