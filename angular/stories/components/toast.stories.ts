import { Component, inject, input, OnInit } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { ToastOutletComponent } from '@components/toast/toast-outlet.component';
import { ToastOptions, ToastService } from '@components/toast/toast.service';

@Component({
  selector: 'ds-toast-demo',
  imports: [ButtonDirective, ToastOutletComponent],
  template: `
    @if (interactive()) {
      <div class="d-flex gap-2 p-3">
        <button dsBtn type="button" (click)="add(success)">Success (hides after 5 s)</button>
        <button dsBtn variant="danger" type="button" (click)="add(danger)">Danger (stays)</button>
        <button dsBtn type="button" (click)="add(info)">Info</button>
      </div>
    }
    <ds-toast-outlet closeLabel="Close" />
  `,
})
class ToastDemoComponent implements OnInit {
  readonly toasts = input<ToastOptions[]>([]);
  readonly interactive = input<boolean>(false);

  protected readonly success: ToastOptions = {
    kind: 'success',
    title: 'Pipeline succeeded',
    message: 'Demo pipeline #6 finished in 01:12.',
  };
  protected readonly danger: ToastOptions = {
    kind: 'danger',
    title: 'Pipeline failed',
    message: 'Demo pipeline #7 failed at step 3.',
  };
  protected readonly info: ToastOptions = {
    kind: 'info',
    title: 'Settings file was reset',
    message: 'settings.json was invalid; defaults are in use.',
  };

  private readonly service: ToastService = inject(ToastService);

  ngOnInit(): void {
    this.service.clear();
    this.toasts().forEach((toast) => this.service.show(toast));
  }

  protected add(toast: ToastOptions): void {
    this.service.show(toast);
  }
}

const meta: Meta<ToastDemoComponent> = {
  title: 'Components/Toast',
  decorators: [moduleMetadata({ imports: [ToastDemoComponent] })],
  render: (args) => ({ props: args, template: '<ds-toast-demo [toasts]="toasts" [interactive]="interactive" />' }),
};

export default meta;

type Story = StoryObj<ToastDemoComponent>;

const SUCCESS: ToastOptions = {
  kind: 'success',
  title: 'Pipeline succeeded',
  message: 'Demo pipeline #6 finished in 01:12.',
  autoHide: false,
};
const DANGER: ToastOptions = {
  kind: 'danger',
  title: 'Pipeline failed',
  message: 'Demo pipeline #7 failed at step 3.',
};
const INFO: ToastOptions = {
  kind: 'info',
  title: 'Settings file was reset',
  message: 'settings.json was invalid; defaults are in use.',
};

export const Success: Story = { args: { toasts: [SUCCESS] } };

export const Danger: Story = { args: { toasts: [DANGER] } };

export const Info: Story = { args: { toasts: [INFO] } };

export const WithAction: Story = {
  args: { toasts: [{ ...DANGER, action: { label: 'View log', run: (): void => undefined } }] },
};

export const Stack: Story = { args: { toasts: [SUCCESS, DANGER, INFO] } };

export const LongVietnamese: Story = {
  args: {
    toasts: [
      {
        kind: 'danger',
        title: 'Không đọc được cơ sở dữ liệu của ứng dụng khi khởi động',
        message:
          'Tệp dữ liệu có thể đã bị hỏng hoặc đang được một tiến trình khác sử dụng. Hãy đóng các cửa sổ khác của ứng dụng rồi thử lại.',
        action: { label: 'Xem chi tiết', run: (): void => undefined },
      },
    ],
  },
};

export const Playground: Story = { args: { toasts: [], interactive: true } };
