import type { Meta, StoryObj } from '@storybook/angular';

interface TokenGroup {
  title: string;
  tokens: string[];
}

const GROUPS: TokenGroup[] = [
  {
    title: 'Brand',
    tokens: ['--color-primary', '--color-primary-hover', '--color-primary-active', '--color-on-primary'],
  },
  {
    title: 'Surface and text',
    tokens: [
      '--color-background',
      '--color-surface',
      '--color-surface-raised',
      '--color-surface-muted',
      '--color-text',
      '--color-text-secondary',
      '--color-text-tertiary',
    ],
  },
  { title: 'Border and focus', tokens: ['--color-border', '--color-border-strong', '--color-focus'] },
  {
    title: 'Status',
    tokens: ['--color-link', '--color-success', '--color-warning', '--color-danger'],
  },
  { title: 'Code', tokens: ['--color-code-background', '--color-code-text'] },
];

const BACKGROUND = '--color-background';
const CODE_BACKGROUND = '--color-code-background';

function tokenValue(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start: number): number => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(token: string): string {
  const base =
    token === '--color-code-text' ? CODE_BACKGROUND : token === '--color-on-primary' ? '--color-primary' : BACKGROUND;
  const [first, second] = [luminance(tokenValue(token)), luminance(tokenValue(base))].sort((a, b) => b - a);
  return ((first + 0.05) / (second + 0.05)).toFixed(2);
}

const meta: Meta = {
  title: 'Foundations/Colors',
  render: () => ({
    props: { groups: GROUPS, value: tokenValue, contrast },
    template: `
      <div class="sb-doc">
        <p class="meta">Swatches show the current theme. Contrast is against the background (on-primary against primary, code text against the code background).</p>
        @for (group of groups; track group.title) {
          <section>
            <h3>{{ group.title }}</h3>
            <div class="sb-grid">
              @for (token of group.tokens; track token) {
                <div class="sb-card">
                  <div class="sb-chip" [style.background]="'var(' + token + ')'"></div>
                  <div class="sb-info">
                    <code>{{ token }}</code>
                    <span class="num">{{ value(token) }}</span>
                    <span class="meta num">Contrast {{ contrast(token) }}:1</span>
                  </div>
                </div>
              }
            </div>
          </section>
        }
      </div>
    `,
  }),
};

export default meta;

export const Colors: StoryObj = {};
