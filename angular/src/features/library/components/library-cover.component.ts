import { booleanAttribute, Component, computed, input, signal, type Signal } from '@angular/core';

const VERTICAL_LANGUAGES: string[] = ['zh', 'ja', 'ko', 'en'];

@Component({
  selector: 'ds-library-cover',
  host: {
    class: 'library-cover',
    '[class.generated]': '!src()',
    '[class.vertical]': '!src() && vertical()',
    '[attr.data-size]': 'size()',
    '[attr.data-palette]': 'palette()',
    'aria-hidden': 'true',
  },
  templateUrl: './library-cover.component.html',
})
export class LibraryCoverComponent {
  readonly cover = input<string | null>(null);
  readonly originalTitle = input<string>('');
  readonly language = input<string>('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly badge = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly palette = input<string>('green');

  protected readonly failed = signal<boolean>(false);
  protected readonly src: Signal<string | null> = computed(() => (this.failed() ? null : this.cover()));
  protected readonly vertical: Signal<boolean> = computed(() => VERTICAL_LANGUAGES.includes(this.language()));
}
