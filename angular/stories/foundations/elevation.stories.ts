import type { Meta, StoryObj } from '@storybook/angular';

const SHADOWS: string[] = ['--shadow-1', '--shadow-2', '--shadow-3'];

const meta: Meta = {
  title: 'Foundations/Elevation',
  render: () => ({
    props: { shadows: SHADOWS },
    template: `
      <div class="sb-doc">
        <section>
          <h3>Elevation</h3>
          <div class="sb-row">
            @for (shadow of shadows; track shadow) {
              <div class="d-flex flex-column gap-2">
                <div class="sb-box wide" [style.borderRadius]="'var(--radius-md)'" [style.boxShadow]="'var(' + shadow + ')'"></div>
                <code>{{ shadow }}</code>
              </div>
            }
          </div>
        </section>
        <section>
          <h3>Scrim</h3>
          <div class="sb-theme position-relative overflow-hidden">
            <span>Content behind a dialog</span>
            <div class="position-absolute top-0 start-0 w-100 h-100" [style.background]="'var(--scrim)'"></div>
          </div>
          <code>--scrim</code>
        </section>
        <section>
          <h3>Focus</h3>
          <p class="meta">2px ring, 2px offset on every interactive element. Tab to the button to see the real ring.</p>
          <div class="sb-row">
            <div class="sb-box wide sb-focus"></div>
            <button type="button">Tab to focus</button>
          </div>
        </section>
        <section>
          <h3>Motion</h3>
          <p class="meta">Transitions are 120ms on color and border (--motion-fast). Reduced motion turns them off.</p>
          <div class="sb-transition" tabindex="0">Hover me</div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Elevation: StoryObj = {};
