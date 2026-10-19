import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { FieldComponent } from '@components/form/field.component';

const meta: Meta = {
  title: 'Components/Input',
  decorators: [moduleMetadata({ imports: [FieldComponent] })],
};

export default meta;

export const Default: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Default" controlId="in-default" hint="Help text in meta style">
          <input id="in-default" class="ds-input" placeholder="Search runs" />
        </ds-field>
      </div>
    `,
  }),
};

export const Focus: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Focus" controlId="in-focus">
          <input id="in-focus" class="ds-input is-focus" value="Demo pipeline" />
        </ds-field>
      </div>
    `,
  }),
};

export const Error: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Error" controlId="in-error" error="Enter a value from 1 to 4." [required]="true">
          <input id="in-error" class="ds-input" value="9" aria-invalid="true" />
        </ds-field>
      </div>
    `,
  }),
};

export const Disabled: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Disabled" controlId="in-disabled">
          <input id="in-disabled" class="ds-input" value="Blocked while a pipeline runs" disabled />
        </ds-field>
      </div>
    `,
  }),
};

export const ReadOnlyPath: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Read-only path (mono)" controlId="in-mono">
          <input id="in-mono" class="ds-input mono" value="C:\\Users\\me\\AppData\\Local\\DreamerStudio" readonly />
        </ds-field>
      </div>
    `,
  }),
};

export const LongVietnameseLabel: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field
          label="Nhãn tiếng Việt rất dài để kiểm tra việc xuống dòng và hiển thị dấu thanh trong biểu mẫu"
          controlId="in-vi"
          hint="Gợi ý: nhập tên truyện hoặc tên nhân vật chính"
        >
          <input id="in-vi" class="ds-input" value="Truyện của tôi" />
        </ds-field>
      </div>
    `,
  }),
};
