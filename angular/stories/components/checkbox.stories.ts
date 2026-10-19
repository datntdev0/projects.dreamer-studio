import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CheckboxComponent } from '@components/form/checkbox.component';

const meta: Meta = {
  title: 'Components/Checkbox',
  decorators: [moduleMetadata({ imports: [CheckboxComponent] })],
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <ds-checkbox>Unchecked</ds-checkbox>
          <ds-checkbox [checked]="true">Fail at step 3</ds-checkbox>
          <ds-checkbox [disabled]="true">Disabled</ds-checkbox>
          <ds-checkbox [checked]="true" [disabled]="true">Disabled, checked</ds-checkbox>
          <ds-checkbox [checked]="true">Tự động lưu bản nháp sau mỗi lần chỉnh sửa chương</ds-checkbox>
        </div>
      </div>
    `,
  }),
};

export default meta;

export const Checkbox: StoryObj = {};
