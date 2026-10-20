import { Component, inject } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmHostComponent } from '@components/dialog/confirm-host.component';
import { ConfirmService } from '@components/dialog/confirm.service';
import { DialogComponent } from '@components/dialog/dialog.component';

@Component({
  selector: 'ds-confirm-demo',
  imports: [ButtonDirective, ConfirmHostComponent],
  template: `
    <div class="d-flex gap-2 p-3">
      <button dsBtn type="button" (click)="ask(false)">Open confirm</button>
      <button dsBtn variant="danger" type="button" (click)="ask(true)">Open danger confirm</button>
    </div>
    <ds-confirm-host />
  `,
})
class ConfirmDemoComponent {
  private readonly confirm: ConfirmService = inject(ConfirmService);

  protected ask(danger: boolean): void {
    void this.confirm.confirm({
      title: danger ? 'Delete 3 runs?' : 'Open the logs folder?',
      message: danger ? 'This cannot be undone.' : "Explorer opens the folder with today's log files.",
      confirmLabel: danger ? 'Delete runs' : 'Open folder',
      cancelLabel: 'Cancel',
      danger,
    });
  }
}

const meta: Meta<DialogComponent> = {
  title: 'Components/Dialog',
  decorators: [moduleMetadata({ imports: [DialogComponent, ConfirmHostComponent, ButtonDirective] })],
};

export default meta;

type Story = StoryObj<DialogComponent>;

export const Confirm: Story = {
  args: { open: true, heading: 'Open the logs folder?', icon: 'info', danger: false, closeLabel: 'Close' },
  render: (args) => ({
    props: args,
    template: `
      <ds-dialog [open]="open" [heading]="heading" [icon]="icon" [danger]="danger" [closeLabel]="closeLabel">
        Explorer opens the folder with today's log files.
        <ng-container dialogFooter>
          <button dsBtn type="button" autofocus data-testid="dialog-cancel">Cancel</button>
          <button dsBtn variant="primary" type="button" data-testid="dialog-confirm">Open folder</button>
        </ng-container>
      </ds-dialog>
    `,
  }),
};

export const DangerConfirm: Story = {
  args: { open: true, heading: 'Delete 3 runs?', icon: 'alert-triangle', danger: true, closeLabel: 'Close' },
  render: (args) => ({
    props: args,
    template: `
      <ds-dialog [open]="open" [heading]="heading" [icon]="icon" [danger]="danger" [closeLabel]="closeLabel">
        The runs and their output files are removed. This cannot be undone.
        <ng-container dialogFooter>
          <button dsBtn type="button" autofocus data-testid="dialog-cancel">Cancel</button>
          <button dsBtn variant="danger-solid" type="button" data-testid="dialog-confirm">Delete runs</button>
        </ng-container>
      </ds-dialog>
    `,
  }),
};

export const NotDismissible: Story = {
  args: { open: true, heading: 'Opening folder…', icon: 'folder', dismissible: false, closeLabel: 'Close' },
  render: (args) => ({
    props: args,
    template: `
      <ds-dialog [open]="open" [heading]="heading" [icon]="icon" [dismissible]="dismissible" [closeLabel]="closeLabel">
        Please wait. There is no close button and Esc is blocked.
      </ds-dialog>
    `,
  }),
};

export const ConfirmServiceDemo: Story = {
  name: 'Confirm service',
  decorators: [moduleMetadata({ imports: [ConfirmDemoComponent] })],
  render: () => ({ template: '<ds-confirm-demo />' }),
};
