import { Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import { PanelDirective } from '@shell/layout/panel.directive';
import { PageTitleDirective } from '@shell/page-title.directive';
import type { LibraryChapter } from '../library/library.models';
import { NovelStore } from '../library/novel.store';
import { NovelChaptersComponent } from '../library/novel-reader/novel-chapters.component';
import { TranslationStore } from '../library/translation.store';
import { GlossaryViewComponent } from '../library/translation/glossary-view.component';
import { InstructionEditorComponent } from '../library/translation/instruction-editor.component';
import { TranslateContentDialogComponent } from '../library/translation/translate-content-dialog.component';
import { TranslateGlossaryDialogComponent } from '../library/translation/translate-glossary-dialog.component';
import { TranslationPillComponent } from '../library/translation/translation-pill.component';

@Component({
  selector: 'ds-translation-page',
  imports: [
    AreaStateComponent,
    BannerComponent,
    ButtonDirective,
    GlossaryViewComponent,
    IconComponent,
    InstructionEditorComponent,
    NovelChaptersComponent,
    PageTitleDirective,
    PanelDirective,
    RouterLink,
    TooltipDirective,
    TranslateContentDialogComponent,
    TranslateGlossaryDialogComponent,
    TranslatePipe,
    TranslationPillComponent,
  ],
  providers: [NovelStore, TranslationStore],
  templateUrl: './translation.page.html',
  host: { class: 'ds-page', 'data-testid': 'translation-page' },
})
export class TranslationPage {
  protected readonly store = inject(TranslationStore);
  protected readonly novelStore = inject(NovelStore);
  protected readonly currentNovel = inject(CurrentNovelStore);
  protected readonly selectedId = computed(() => {
    const position = this.store.selectedChapter();
    return this.novelStore.chapters().find((chapter) => chapter.position === position)?.id ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.currentNovel.novelId();
      if (id) untracked(() => this.openNovel(id));
    });
  }

  protected openChapterTranslation(): void {
    const position = this.store.selectedChapter();
    if (position === null) {
      this.store.openContentDialog(null);
      return;
    }
    this.store.openChapterDialog(position, this.store.chapterStatus(position)?.status !== 'not-translated');
  }

  protected select(id: string | null): void {
    const chapter: LibraryChapter | undefined = this.novelStore.chapters().find((item) => item.id === id);
    this.store.selectedChapter.set(chapter?.position ?? null);
  }

  protected setLanguage(event: Event): void {
    this.store.setLanguage((event.target as HTMLSelectElement).value as TargetLanguage);
  }

  private async openNovel(id: string): Promise<void> {
    void this.novelStore.open(id);
    await this.store.open(id);
    this.store.setView('glossary');
  }
}
