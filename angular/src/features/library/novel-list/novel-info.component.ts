import { booleanAttribute, Component, inject, input } from '@angular/core';
import { formatDateTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { LibraryNovel } from '../library.models';
import { LibraryCoverComponent } from './library-cover.component';

@Component({
  selector: 'ds-novel-info',
  imports: [LibraryCoverComponent, TranslatePipe],
  templateUrl: './novel-info.component.html',
})
export class NovelInfoComponent {
  readonly novel = input.required<LibraryNovel>();
  readonly showCover = input<boolean, unknown>(true, { transform: booleanAttribute });
  private readonly i18n: I18nService = inject(I18nService);

  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected date(iso: string): string {
    return formatDateTime(iso, this.i18n.language());
  }

  protected synopsis(): string {
    return this.i18n.language() === 'vi' ? this.novel().descriptionVi : this.novel().description;
  }
}
