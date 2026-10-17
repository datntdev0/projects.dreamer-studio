import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import type { ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorCopy, errorText } from '@dreamer/shared/errors/error-copy';

export type ErrorBannerVariant = 'danger' | 'warning';

type BannerIcon = 'warning' | 'danger';

@Component({
  selector: 'ns-error-banner',
  imports: [NgTemplateOutlet],
  template: `
    <section
      class="banner"
      [class.warning]="variant() === 'warning'"
      [attr.role]="variant() === 'warning' ? 'status' : 'alert'"
      data-testid="error-banner"
    >
      <ng-container [ngTemplateOutlet]="icon" [ngTemplateOutletContext]="{ $implicit: bannerIcon() }" />
      <div class="body">
        <strong class="title">{{ copy().title }}</strong>
        <span class="message">{{ copy().message }}</span>
        <span class="meta" data-testid="error-banner-code">{{ codeLine() }}</span>
      </div>
      <button class="btn" type="button" data-testid="error-banner-open-logs" (click)="openLogs.emit()">
        {{ text.openLogs }}
      </button>
      @if (dismissible()) {
        <button
          class="btn icon-btn"
          type="button"
          [attr.aria-label]="text.dismiss"
          data-testid="error-banner-dismiss"
          (click)="dismiss.emit()"
        >
          <ng-container [ngTemplateOutlet]="icon" [ngTemplateOutletContext]="{ $implicit: 'close' }" />
        </button>
      }
    </section>
    <ng-template #icon let-name>
      <svg
        class="icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        @switch (name) {
          @case ('warning') {
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
          }
          @case ('close') {
            <path d="M18 6 6 18M6 6l12 12" />
          }
          @default {
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          }
        }
      </svg>
    </ng-template>
  `,
  styles: `
    .banner {
      --banner-color: var(--color-danger);
      display: flex;
      align-items: flex-start;
      gap: var(--sp-md);
      padding: var(--sp-md);
      color: var(--color-text);
      border: 1px solid var(--banner-color);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--banner-color) 14%, transparent);
    }
    .banner.warning {
      --banner-color: var(--color-warning);
      background: color-mix(in srgb, var(--banner-color) 16%, transparent);
    }
    .icon {
      flex: none;
      width: var(--sp-xl);
      height: var(--sp-xl);
      color: var(--banner-color);
    }
    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--sp-xxs);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .btn {
      flex: none;
      padding: var(--sp-xs) var(--sp-md);
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--font-size-meta);
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      background: transparent;
      transition:
        background 120ms,
        border-color 120ms;
    }
    .btn:hover {
      background: var(--color-surface-muted);
    }
    .btn:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .icon-btn {
      display: flex;
      padding: var(--sp-xs);
      border-color: transparent;
    }
    .icon-btn .icon {
      width: var(--sp-lg);
      height: var(--sp-lg);
      color: currentColor;
    }
  `,
})
export class ErrorBannerComponent {
  readonly code = input.required<ErrorCode>();
  readonly count = input<number>(1);
  readonly variant = input<ErrorBannerVariant>('danger');
  readonly dismissible = input<boolean>(true);
  readonly openLogs = output<void>();
  readonly dismiss = output<void>();

  protected readonly text = errorText;
  protected readonly bannerIcon = computed<BannerIcon>(() => (this.variant() === 'warning' ? 'warning' : 'danger'));
  protected readonly copy = computed(() => errorCopy[this.code()]);
  protected readonly codeLine = computed(
    () => `${errorText.code}: ${this.code()}${this.count() > 1 ? ` (×${this.count()})` : ''}`,
  );
}
