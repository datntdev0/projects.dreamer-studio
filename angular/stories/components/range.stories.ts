import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { FieldComponent } from '@components/form/field.component';
import { RangeDirective } from '@components/form/range.directive';

const meta: Meta = {
  title: 'Components/Range',
  decorators: [moduleMetadata({ imports: [FieldComponent, RangeDirective] })],
};

export default meta;

export const Default: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Font size" controlId="range-default">
          <input id="range-default" type="range" dsRange min="14" max="28" value="18" />
        </ds-field>
      </div>
    `,
  }),
};

export const WithValue: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <ds-field label="Parallel chapters" controlId="range-value">
          <span class="settings-range">
            <input id="range-value" type="range" dsRange min="1" max="10" value="4" />
            <output class="ds-range-value num" for="range-value">4</output>
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
        <ds-field label="Disabled" controlId="range-disabled">
          <input id="range-disabled" type="range" dsRange min="0" max="100" value="40" disabled />
        </ds-field>
      </div>
    `,
  }),
};
