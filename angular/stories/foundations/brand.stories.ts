import type { Meta, StoryObj } from '@storybook/angular';

const meta: Meta = {
  title: 'Foundations/Brand',
  render: () => ({
    template: `
      <div class="sb-doc">
        <section>
          <h3>Mark</h3>
          <div class="sb-row">
            <div class="sb-theme" data-theme="light">
              <img class="sb-mark" src="brand/dreamer-studio-mark-light.svg" alt="Dreamer Studio mark, light" />
              <p class="meta">brand/dreamer-studio-mark-light.svg</p>
            </div>
            <div class="sb-theme" data-theme="dark">
              <img class="sb-mark" src="brand/dreamer-studio-mark-dark.svg" alt="Dreamer Studio mark, dark" />
              <p class="meta">brand/dreamer-studio-mark-dark.svg</p>
            </div>
          </div>
        </section>
        <section>
          <h3>App icon</h3>
          <div class="sb-row">
            <img class="sb-mark" src="logo.svg" alt="Dreamer Studio app icon" />
            <img class="sb-mark sm" src="logo.svg" alt="Dreamer Studio app icon, small" />
          </div>
          <p class="meta">logo.svg, dark rounded tile. Keep about a quarter of the mark height clear on every side.</p>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Brand: StoryObj = {};
