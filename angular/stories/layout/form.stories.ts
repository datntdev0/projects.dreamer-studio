import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { FieldComponent } from '@components/form/field.component';

interface FormArgs {
  width: string;
}

const meta: Meta<FormArgs> = {
  title: 'Layout/Form',
  parameters: { layout: 'fullscreen' },
  decorators: [moduleMetadata({ imports: [ButtonDirective, FieldComponent] })],
  args: { width: '100%' },
  render: (args) => ({
    props: args,
    template: `
      <div style="height: 100vh; display: flex">
        <section class="ds-page" [style.max-width]="width">
          <div class="ds-page-toolbar"><h1>New project</h1></div>
          <div class="ds-page-body narrow">
            <form class="ds-form-grid" id="layout-form">
              <div class="ds-form-grid-fields">
                <ds-field label="Name" controlId="lf-name"><input id="lf-name" class="ds-input" value="Demo pipeline" /></ds-field>
                <ds-field label="Owner" controlId="lf-owner"><input id="lf-owner" class="ds-input" value="Dat" /></ds-field>
                <ds-field label="Description" span="full" controlId="lf-desc" hint="Long fields span both columns."><input id="lf-desc" class="ds-input" value="Hành trình của một giấc mơ" /></ds-field>
                <ds-field label="Source language" controlId="lf-source"><input id="lf-source" class="ds-input" value="zh-CN" /></ds-field>
                <ds-field label="Target language" controlId="lf-target" error="Pick a target."><input id="lf-target" class="ds-input" /></ds-field>
              </div>
            </form>
          </div>
          <div class="ds-page-footer">
            <button dsBtn type="button">Cancel</button>
            <button dsBtn variant="primary" type="submit" form="layout-form">Save</button>
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const OneColumn: StoryObj<FormArgs> = { args: { width: '600px' } };

export const TwoColumns: StoryObj<FormArgs> = { args: { width: '100%' } };
