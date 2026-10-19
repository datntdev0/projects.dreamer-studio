import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { SplitterDirective } from '@components/splitter/splitter.directive';

interface SplitterArgs {
  size: number;
}

const meta: Meta<SplitterArgs> = {
  title: 'Components/Splitter',
  decorators: [moduleMetadata({ imports: [SplitterDirective] })],
  args: { size: 0 },
  render: (args) => ({
    props: args,
    template: `
      <div class="sb-doc">
        <section>
          <h3>Vertical (left panel): drag, arrows, Home, End, Enter or double-click to reset</h3>
          <div style="display: flex; height: 160px; background: var(--color-border)">
            <aside #left class="ds-panel-left" style="width: 200px"><p class="meta">Left</p></aside>
            <ds-splitter [target]="left" edge="left" label="Resize left panel" (resized)="size = $event" />
            <div style="flex: 1; background: var(--color-background); padding: var(--sp-md)">Center · {{ size }}px</div>
          </div>
        </section>
        <section>
          <h3>Horizontal (bottom panel)</h3>
          <div style="display: flex; flex-direction: column; height: 240px; background: var(--color-border)">
            <div style="flex: 1; background: var(--color-background); padding: var(--sp-md)">Center</div>
            <ds-splitter [target]="bottom" edge="bottom" label="Resize bottom panel" />
            <aside #bottom class="ds-panel-bottom" style="height: 80px"><p class="meta">Bottom</p></aside>
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Default: StoryObj<SplitterArgs> = {};
