import { Component, ElementRef, computed, effect, inject, signal, viewChild, type Signal } from '@angular/core';
import { AreaStateComponent } from '@components/state/area-state.component';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { PillComponent } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { PackageWarningCode } from '@dreamer/shared/models/novel-package';
import { formatCount } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { ImportStore, type ImportChapter } from '../import.store';

interface RowRange {
  start: number;
  end: number;
}

const OVERSCAN_ROWS: number = 8;
const FIRST_PAINT_ROWS: number = 30;

const CHECK_KEYS: Record<PackageWarningCode, string> = {
  chapterEmpty: 'library.import.chapters.check.empty',
  sameText: 'library.import.chapters.check.sameText',
  ignoredFile: 'library.import.checks.ignored',
};

function hasWarnings(chapter: ImportChapter): boolean {
  return chapter.warnings.length > 0;
}

@Component({
  selector: 'ds-import-chapters',
  imports: [AreaStateComponent, CheckboxComponent, PillComponent, TooltipDirective, TranslatePipe],
  templateUrl: './import-chapters.component.html',
})
export class ImportChaptersComponent {
  protected readonly store: ImportStore = inject(ImportStore);
  protected readonly checkKeys: Record<PackageWarningCode, string> = CHECK_KEYS;
  protected readonly onlyWarnings = signal<boolean>(false);
  protected readonly revealed = signal<number | null>(null);
  protected readonly scrollTop = signal<number>(0);
  private readonly viewportHeight = signal<number>(0);
  private readonly rowHeight = signal<number>(0);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly warningCount: Signal<number> = computed(() => this.store.chapters().filter(hasWarnings).length);
  protected readonly shown: Signal<ImportChapter[]> = computed(() =>
    this.onlyWarnings() ? this.store.chapters().filter(hasWarnings) : this.store.chapters(),
  );
  protected readonly allShownIncluded: Signal<boolean> = computed(
    () => this.shown().length > 0 && this.shown().every((chapter: ImportChapter): boolean => chapter.included),
  );
  protected readonly range: Signal<RowRange> = computed(() => {
    const total: number = this.shown().length;
    const height: number = this.rowHeight();
    if (!height) return { start: 0, end: Math.min(total, FIRST_PAINT_ROWS) };
    const first: number = Math.floor(this.scrollTop() / height);
    const last: number = Math.ceil((this.scrollTop() + this.viewportHeight()) / height);
    return { start: Math.max(0, first - OVERSCAN_ROWS), end: Math.min(total, last + OVERSCAN_ROWS) };
  });
  protected readonly visibleRows: Signal<ImportChapter[]> = computed(() =>
    this.shown().slice(this.range().start, this.range().end),
  );
  protected readonly padTop: Signal<number> = computed(() => this.range().start * this.rowHeight());
  protected readonly padBottom: Signal<number> = computed(
    () => (this.shown().length - this.range().end) * this.rowHeight(),
  );
  constructor() {
    effect((onCleanup) => {
      const element: HTMLElement | undefined = this.viewport()?.nativeElement;
      if (!element) return;
      this.rowHeight.set(parseFloat(getComputedStyle(element).getPropertyValue('--control-h-lg')));
      const observer: ResizeObserver = new ResizeObserver(() => this.viewportHeight.set(element.clientHeight));
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
  }

  reveal(index: number): void {
    if (this.onlyWarnings() && !this.shown().some((chapter: ImportChapter): boolean => chapter.index === index)) {
      this.onlyWarnings.set(false);
    }
    const position: number = this.shown().findIndex((chapter: ImportChapter): boolean => chapter.index === index);
    const element: HTMLElement | undefined = this.viewport()?.nativeElement;
    if (position < 0 || !element) return;
    this.revealed.set(index);
    element.scrollTo({ top: position * this.rowHeight() - (element.clientHeight - this.rowHeight()) / 2 });
  }

  protected fileName(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }

  protected formatCount(value: number): string {
    return formatCount(value, this.i18n.language());
  }

  protected warningParams(chapter: ImportChapter, code: PackageWarningCode): Record<string, string | number> {
    return chapter.warnings.find((warning) => warning.code === code)?.params ?? {};
  }

  protected filter(onlyWarnings: boolean): void {
    this.onlyWarnings.set(onlyWarnings);
    this.viewport()?.nativeElement.scrollTo({ top: 0 });
    this.scrollTop.set(0);
  }

  protected include(index: number, included: boolean): void {
    this.store.updateChapters((chapter: ImportChapter): boolean => chapter.index === index, { included });
  }

  protected includeShown(included: boolean): void {
    const indexes: Set<number> = new Set(this.shown().map((chapter: ImportChapter): number => chapter.index));
    this.store.updateChapters((chapter: ImportChapter): boolean => indexes.has(chapter.index), { included });
  }

  protected rename(index: number, event: Event): void {
    const title: string = (event.target as HTMLInputElement).value;
    this.store.updateChapters((chapter: ImportChapter): boolean => chapter.index === index, { title });
  }
}
