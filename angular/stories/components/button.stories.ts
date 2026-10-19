import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';

const VARIANTS: string[] = ['primary', 'secondary', 'ghost', 'danger', 'danger-solid'];
const SIZES: string[] = ['sm', 'md', 'lg'];

const meta: Meta<ButtonDirective> = {
  title: 'Components/Button',
  decorators: [moduleMetadata({ imports: [ButtonDirective, IconComponent] })],
};

export default meta;

type Story = StoryObj<ButtonDirective>;

export const Variants: Story = {
  render: () => ({
    props: { variants: VARIANTS, sizes: SIZES },
    template: `
      <div class="sb-doc">
        @for (size of sizes; track size) {
          <section>
            <h3>Size {{ size }}</h3>
            <div class="sb-row">
              @for (variant of variants; track variant) {
                <button dsBtn [variant]="variant" [size]="size">{{ variant }}</button>
              }
            </div>
          </section>
        }
      </div>
    `,
  }),
};

export const WithIcon: Story = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <button dsBtn variant="primary"><ds-icon name="play" size="sm" />Run demo</button>
          <button dsBtn><ds-icon name="folder" size="sm" />Open in Explorer</button>
          <button dsBtn variant="ghost">View all<ds-icon name="arrow-right" size="sm" /></button>
          <button dsBtn variant="danger"><ds-icon name="trash" size="sm" />Delete runs</button>
        </div>
      </div>
    `,
  }),
};

export const IconOnly: Story = {
  render: () => ({
    props: { sizes: SIZES },
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          @for (size of sizes; track size) {
            <button dsBtn variant="ghost" iconOnly [size]="size" aria-label="More"><ds-icon name="more" /></button>
            <button dsBtn iconOnly [size]="size" aria-label="Settings"><ds-icon name="settings" /></button>
          }
        </div>
      </div>
    `,
  }),
};

export const Loading: Story = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <button dsBtn variant="primary" loading>Running checks</button>
          <button dsBtn loading>Loading</button>
          <button dsBtn variant="primary" size="lg" loading>Large</button>
          <button dsBtn variant="ghost" iconOnly loading aria-label="Refreshing"><ds-icon name="retry" /></button>
        </div>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    props: { variants: VARIANTS },
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          @for (variant of variants; track variant) {
            <button dsBtn [variant]="variant" disabled>{{ variant }}</button>
          }
        </div>
      </div>
    `,
  }),
};

export const AsLink: Story = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <a dsBtn variant="primary" href="#">Link button</a>
          <a dsBtn href="#">Link button</a>
        </div>
      </div>
    `,
  }),
};
