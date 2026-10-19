import type { Meta, StoryObj } from '@storybook/angular';

const LINES: number[] = Array.from({ length: 24 }, (_: unknown, index: number): number => index + 1);

const meta: Meta = {
  title: 'Foundations/Scrollbar',
  render: () => ({
    props: { lines: LINES },
    template: `
      <div class="sb-doc">
        <p class="meta">Thin scrollbar, transparent track, thumb --color-border-strong, fully rounded.</p>
        <div class="sb-scroll">
          <div>
            @for (line of lines; track line) {
              <p class="muted">Line {{ line }}: scroll vertically and horizontally to see the thumb.</p>
            }
          </div>
        </div>
      </div>
    `,
  }),
};

export default meta;

export const Scrollbar: StoryObj = {};
