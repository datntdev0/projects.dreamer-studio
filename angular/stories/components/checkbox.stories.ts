import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CheckboxComponent } from '@components/form/checkbox.component';

const meta: Meta = {
  title: 'Components/Checkbox',
  decorators: [moduleMetadata({ imports: [CheckboxComponent] })],
};

export default meta;

export const Default: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <ds-checkbox>Unchecked</ds-checkbox>
          <ds-checkbox [checked]="true">Fail at step 3</ds-checkbox>
        </div>
      </div>
    `,
  }),
};

export const Disabled: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <ds-checkbox [disabled]="true">Disabled</ds-checkbox>
          <ds-checkbox [checked]="true" [disabled]="true">Disabled, checked</ds-checkbox>
        </div>
      </div>
    `,
  }),
};

export const LongVietnameseLabel: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-checkbox [checked]="true">Tự động lưu bản nháp sau mỗi lần chỉnh sửa chương</ds-checkbox>
      </div>
    `,
  }),
};
