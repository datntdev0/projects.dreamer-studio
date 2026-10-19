import type { Meta, StoryObj } from '@storybook/angular';

const FAMILIES: string[] = ['--font-sans', '--font-serif', '--font-mono'];
const SAMPLE = 'The quick brown fox jumps over the lazy dog 0123456789';
const VIETNAMESE = 'Không có tác vụ đang chạy';

const meta: Meta = {
  title: 'Foundations/Typography',
  render: () => ({
    props: { families: FAMILIES, sample: SAMPLE, vietnamese: VIETNAMESE },
    template: `
      <div class="sb-doc">
        <section>
          <h3>Scale</h3>
          <div class="sb-scale">
            <h1>Heading 1</h1><span class="meta">h1</span><span class="meta">22px / 600 / 1.25</span>
            <h2>Heading 2</h2><span class="meta">h2</span><span class="meta">18px / 600 / 1.4</span>
            <h3>Heading 3</h3><span class="meta">h3</span><span class="meta">14px / 600 / 1.45</span>
            <h4>Heading 4</h4><span class="meta">h4</span><span class="meta">12px / 500 / 1.4, secondary</span>
            <span>Body text</span><span class="meta">body</span><span class="meta">13px / 400 / 1.45</span>
            <span class="meta">Meta text</span><span class="meta">.meta</span><span class="meta">12px, tertiary</span>
            <span class="muted">Muted text</span><span class="meta">.muted</span><span class="meta">secondary color</span>
            <span class="num">1,234.56 00:42</span><span class="meta">.num</span><span class="meta">tabular numerals</span>
          </div>
        </section>
        <section>
          <h3>Families</h3>
          @for (family of families; track family) {
            <div>
              <code>{{ family }}</code>
              <p [style.fontFamily]="'var(' + family + ')'">{{ sample }}</p>
              <p [style.fontFamily]="'var(' + family + ')'">{{ vietnamese }}</p>
            </div>
          }
        </section>
        <section>
          <h3>Inline</h3>
          <p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to open <code>command.run()</code> and find <mark>highlighted</mark> text.</p>
          <p class="serif">Serif reading text: {{ vietnamese }}.</p>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Typography: StoryObj = {};
