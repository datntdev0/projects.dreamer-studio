import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { FieldComponent } from '@components/form/field.component';

function formTemplate(suffix: string): string {
  return `
    <div class="ds-form-grid">
      <div class="ds-form-grid-fields">
        <ds-field label="Title" controlId="fg-title-${suffix}">
          <input id="fg-title-${suffix}" class="ds-input" value="Demo pipeline" />
        </ds-field>
        <ds-field label="Author" controlId="fg-author-${suffix}">
          <input id="fg-author-${suffix}" class="ds-input" value="Dat" />
        </ds-field>
        <ds-field
          label="Tên dự án dịch thuật với nhãn tiếng Việt rất dài"
          span="full"
          controlId="fg-long-${suffix}"
          hint="Trường dài chiếm cả hai cột"
        >
          <input id="fg-long-${suffix}" class="ds-input" value="Hành trình của một giấc mơ" />
        </ds-field>
        <ds-field label="Source" controlId="fg-source-${suffix}">
          <input id="fg-source-${suffix}" class="ds-input" value="zh-CN" />
        </ds-field>
        <ds-field label="Target" controlId="fg-target-${suffix}" error="Pick a target.">
          <input id="fg-target-${suffix}" class="ds-input" />
        </ds-field>
      </div>
    </div>
  `;
}

const meta: Meta = {
  title: 'Components/Forms',
  decorators: [moduleMetadata({ imports: [FieldComponent] })],
  render: () => ({
    template: `
      <div class="sb-doc">
        <section>
          <h3>Narrow (480px): 1 column</h3>
          <div style="width: 480px">${formTemplate('narrow')}</div>
        </section>
        <section>
          <h3>Wide (900px): 2 columns from 760px</h3>
          <div style="width: 900px">${formTemplate('wide')}</div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const FormGrid: StoryObj = {};
