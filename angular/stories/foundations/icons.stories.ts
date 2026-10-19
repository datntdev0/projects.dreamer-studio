import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { IconComponent } from '@components/icon/icon.component';

const SIZES: string[] = ['sm', 'md', 'lg', 'xl'];
const SIZE_PIXELS: Record<string, string> = { sm: '14px', md: '16px', lg: '20px', xl: '28px' };
const SAMPLE_ICONS: string[] = ['search', 'settings', 'play', 'alert-triangle'];

function iconNames(): string[] {
  return Array.from(document.querySelectorAll('[data-icon-sprite] symbol')).map((symbol: Element): string =>
    symbol.id.replace('i-', ''),
  );
}

const meta: Meta = {
  title: 'Foundations/Icons',
  decorators: [moduleMetadata({ imports: [IconComponent] })],
  render: () => ({
    props: { sizes: SIZES, pixels: SIZE_PIXELS, samples: SAMPLE_ICONS, names: iconNames },
    template: `
      <div class="sb-doc">
        <section>
          <h3>Sizes</h3>
          <div class="sb-row">
            @for (size of sizes; track size) {
              <div class="sb-cell">
                <div class="d-flex gap-2">
                  @for (name of samples; track name) {
                    <ds-icon [name]="name" [size]="size" />
                  }
                </div>
                <span>{{ size }} {{ pixels[size] }}</span>
              </div>
            }
          </div>
        </section>
        <section>
          <h3>All icons ({{ names().length }})</h3>
          <div class="sb-grid narrow">
            @for (name of names(); track name) {
              <div class="sb-cell">
                <ds-icon [name]="name" size="lg" />
                <span>{{ name }}</span>
              </div>
            }
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Icons: StoryObj = {};
