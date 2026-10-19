import type { Meta, StoryObj } from '@storybook/angular';

interface Token {
  name: string;
  value: string;
}

const SPACING: Token[] = [
  { name: '--sp-xxs', value: '2px' },
  { name: '--sp-xs', value: '4px' },
  { name: '--sp-sm', value: '8px' },
  { name: '--sp-md', value: '12px' },
  { name: '--sp-lg', value: '16px' },
  { name: '--sp-xl', value: '24px' },
  { name: '--sp-xxl', value: '32px' },
  { name: '--sp-huge', value: '64px' },
];

const RADIUS: Token[] = [
  { name: '--radius-xs', value: '4px' },
  { name: '--radius-sm', value: '6px' },
  { name: '--radius-md', value: '8px' },
  { name: '--radius-lg', value: '12px' },
  { name: '--radius-xl', value: '16px' },
  { name: '--radius-full', value: '9999px' },
];

const CONTROLS: Token[] = [
  { name: '--control-h', value: '28px, button / input / select' },
  { name: '--control-h-sm', value: '24px, small button' },
  { name: '--control-h-lg', value: '36px, large button' },
  { name: '--pill-h', value: '20px, pill' },
  { name: '--badge-h', value: '16px, badge' },
  { name: '--dot-size', value: '7px, status dot' },
];

const meta: Meta = {
  title: 'Foundations/Spacing',
  render: () => ({
    props: { spacing: SPACING, radius: RADIUS, controls: CONTROLS },
    template: `
      <div class="sb-doc">
        <section>
          <h3>Spacing</h3>
          @for (token of spacing; track token.name) {
            <div class="sb-scale">
              <code>{{ token.name }}</code>
              <span class="meta num">{{ token.value }}</span>
              <div class="sb-bar" [style.width]="'var(' + token.name + ')'"></div>
            </div>
          }
        </section>
        <section>
          <h3>Radius</h3>
          <div class="sb-row">
            @for (token of radius; track token.name) {
              <div class="d-flex flex-column gap-1">
                <div class="sb-box" [style.borderRadius]="'var(' + token.name + ')'"></div>
                <code>{{ token.name }}</code>
                <span class="meta num">{{ token.value }}</span>
              </div>
            }
          </div>
        </section>
        <section>
          <h3>Control heights</h3>
          @for (token of controls; track token.name) {
            <div class="sb-scale">
              <code>{{ token.name }}</code>
              <span class="meta num">{{ token.value }}</span>
              <div class="sb-bar" [style.height]="'var(' + token.name + ')'" [style.width]="'var(--sp-huge)'"></div>
            </div>
          }
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Spacing: StoryObj = {};
