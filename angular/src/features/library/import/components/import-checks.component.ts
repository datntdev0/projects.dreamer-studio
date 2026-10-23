import { Component, computed, inject, output, type Signal } from '@angular/core';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import type { PackageWarning, PackageWarningCode } from '@dreamer/shared/models/novel-package';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { ImportStore, type ImportChapter } from '../import.store';

interface CheckRow {
  key: string;
  subject: string;
  messageKey: string;
  params: TranslateParams;
  index: number | null;
  included: boolean;
}

const CHECK_MESSAGE_KEYS: Record<PackageWarningCode, string> = {
  chapterEmpty: 'library.import.checks.empty',
  sameText: 'library.import.checks.sameText',
  ignoredFile: 'library.import.checks.ignored',
};

@Component({
  selector: 'ds-import-checks',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, TranslatePipe],
  templateUrl: './import-checks.component.html',
})
export class ImportChecksComponent {
  readonly reveal = output<number>();

  protected readonly store: ImportStore = inject(ImportStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly rows: Signal<CheckRow[]> = computed(() => {
    const chapters: ImportChapter[] = this.store.chapters();
    return (this.store.preview()?.warnings ?? []).map((warning: PackageWarning, offset: number): CheckRow => {
      const index: number | null = warning.code === 'ignoredFile' ? null : Number(warning.params['index']);
      const chapter: ImportChapter | undefined =
        index === null ? undefined : chapters.find((item: ImportChapter): boolean => item.index === index);
      return {
        key: `${warning.code}-${warning.where}-${offset}`,
        subject:
          index === null
            ? String(warning.params['file'] ?? warning.where)
            : this.i18n.t('library.import.checks.chapter', { index }),
        messageKey: CHECK_MESSAGE_KEYS[warning.code],
        params: warning.params,
        index,
        included: chapter?.included ?? true,
      };
    });
  });
}
