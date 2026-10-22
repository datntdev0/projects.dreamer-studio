import { Component, computed, inject, input, type Signal } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '../../../core/i18n/i18n.service';
import { chapterLabel } from '../library-format';
import type { LibraryNovel } from '../library.models';

@Component({
  selector: 'ds-novel-dialog-summary',
  imports: [IconComponent, TooltipDirective],
  host: { class: 'novel-dlg-summary' },
  templateUrl: './novel-dialog-summary.component.html',
})
export class NovelDialogSummaryComponent {
  readonly novel = input.required<LibraryNovel>();

  private readonly i18n: I18nService = inject(I18nService);

  protected readonly chapters: Signal<string> = computed(() => chapterLabel(this.i18n, this.novel().chapterCount));
}
