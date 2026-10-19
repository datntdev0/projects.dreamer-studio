import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';

const meta: Meta = {
  title: 'Components/Select',
  decorators: [moduleMetadata({ imports: [FieldComponent, IconComponent] })],
};

export default meta;

export const Default: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Default" controlId="sel-default">
          <span class="ds-select">
            <select id="sel-default" class="ds-input">
              <option>English</option>
              <option>Tiếng Việt</option>
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
      </div>
    `,
  }),
};

export const Focus: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Focus" controlId="sel-focus">
          <span class="ds-select">
            <select id="sel-focus" class="ds-input is-focus">
              <option>Tiếng Việt</option>
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
      </div>
    `,
  }),
};

export const Error: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Error" controlId="sel-error" error="Pick a language.">
          <span class="ds-select">
            <select id="sel-error" class="ds-input" aria-invalid="true">
              <option>Choose a language</option>
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
      </div>
    `,
  }),
};

export const Disabled: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Disabled" controlId="sel-disabled">
          <span class="ds-select">
            <select id="sel-disabled" class="ds-input" disabled>
              <option>All statuses</option>
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
      </div>
    `,
  }),
};

export const LongVietnameseLabel: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Ngôn ngữ giao diện và ngôn ngữ của bản dịch đầu ra, nhãn dài" controlId="sel-vi">
          <span class="ds-select">
            <select id="sel-vi" class="ds-input">
              <option>Tiếng Việt (Việt Nam)</option>
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
      </div>
    `,
  }),
};
