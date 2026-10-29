import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import type { NovelSummary } from '@dreamer/shared/models/novel';

@Component({
  selector: 'ds-novel-scope',
  imports: [ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './novel-scope.component.html',
  host: {
    class: 'ds-novel-scope',
    '(document:pointerdown)': 'closeOutside($event)',
    '(keydown.escape)': 'close(true)',
  },
})
export class NovelScopeComponent {
  protected readonly store: CurrentNovelStore = inject(CurrentNovelStore);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly router: Router = inject(Router);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly results = computed<NovelSummary[]>(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.store
      .novels()
      .filter(
        (novel) =>
          !query ||
          [novel.title, novel.originalTitle, novel.author].some((text) => text.toLocaleLowerCase().includes(query)),
      );
  });

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.query.set('');
    this.active.set(
      Math.max(
        0,
        this.results().findIndex((novel) => novel.id === this.store.novelId()),
      ),
    );
    this.open.set(true);
    setTimeout(() => this.search()?.nativeElement.focus());
  }

  protected close(focusTrigger: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (focusTrigger) this.trigger().nativeElement.focus();
  }

  protected closeOutside(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected move(event: KeyboardEvent): void {
    const count = this.results().length;
    if (!count) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.update((index) => (index + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.choose(this.results()[this.active()]);
    }
  }

  protected choose(novel: NovelSummary | undefined): void {
    if (novel) this.store.select(novel.id);
    this.close(true);
  }

  protected openNovel(id: string): void {
    this.close(false);
    void this.router.navigate(['/library', id]);
  }

  protected openLibrary(): void {
    this.close(false);
    void this.router.navigateByUrl('/library');
  }
}
