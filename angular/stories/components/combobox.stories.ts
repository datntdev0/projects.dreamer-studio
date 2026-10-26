import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ComboboxComponent } from '@components/form/combobox.component';
import { FieldComponent } from '@components/form/field.component';

const MODEL_IDS: string[] = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

const meta: Meta = {
  title: 'Components/Combobox',
  decorators: [moduleMetadata({ imports: [ComboboxComponent, FieldComponent] })],
};

export default meta;

export const Default: StoryObj = {
  render: () => ({
    props: { value: '', options: MODEL_IDS },
    template: `
      <div class="sb-doc">
        <ds-field label="Model id" controlId="combo-default" hint="Pick a suggestion or enter any model id.">
          <ds-combobox inputId="combo-default" testId="combo-default" toggleLabel="Show model suggestions"
            placeholder="CLI default" [options]="options" [value]="value" (committed)="value = $event" />
        </ds-field>
        <p>Committed value: {{ value || '(empty)' }}</p>
      </div>
    `,
  }),
};

export const WithValue: StoryObj = {
  render: () => ({
    props: { value: 'claude-sonnet-5-5', options: MODEL_IDS },
    template: `
      <div class="sb-doc">
        <ds-field label="Model id" controlId="combo-value" hint="The model id uses a monospace font.">
          <ds-combobox inputId="combo-value" testId="combo-value" toggleLabel="Show model suggestions"
            [options]="options" mono [value]="value" (committed)="value = $event" />
        </ds-field>
        <p>Committed value: {{ value || '(empty)' }}</p>
      </div>
    `,
  }),
};

export const Disabled: StoryObj = {
  render: () => ({
    props: { value: 'claude-opus-5-5', options: MODEL_IDS },
    template: `
      <div class="sb-doc">
        <ds-field label="Model id" controlId="combo-disabled" hint="Model selection is unavailable.">
          <ds-combobox inputId="combo-disabled" testId="combo-disabled" toggleLabel="Show model suggestions"
            [options]="options" disabled [value]="value" (committed)="value = $event" />
        </ds-field>
        <p>Committed value: {{ value || '(empty)' }}</p>
      </div>
    `,
  }),
};

export const NoOptions: StoryObj = {
  render: () => ({
    props: { value: '', options: [] as string[] },
    template: `
      <div class="sb-doc">
        <ds-field label="Model id" controlId="combo-empty" hint="Enter a model id to use with this CLI.">
          <ds-combobox inputId="combo-empty" testId="combo-empty" toggleLabel="Show model suggestions"
            placeholder="CLI default" [options]="options" [value]="value" (committed)="value = $event" />
        </ds-field>
        <p>Committed value: {{ value || '(empty)' }}</p>
      </div>
    `,
  }),
};
