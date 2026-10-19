import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CardComponent } from '@components/card/card.component';
import { PillComponent } from '@components/status/pill.component';

const meta: Meta = {
  title: 'Components/Card',
  decorators: [moduleMetadata({ imports: [CardComponent, PillComponent] })],
};

export default meta;

export const Static: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-grid">
          <ds-card>
            <h3>App data</h3>
            <p class="muted">Library, logs and cache live in one folder.</p>
          </ds-card>
          <ds-card icon="info" heading="With head">
            <ds-pill dsCardEnd kind="success">Ready</ds-pill>
            <p class="muted mb-0">Icon, title and a right slot.</p>
          </ds-card>
        </div>
      </div>
    `,
  }),
};

export const Interactive: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-grid">
          <ds-card interactive icon="tasks" heading="Pipelines">
            <p class="meta mb-0">Running pipelines and history</p>
          </ds-card>
          <ds-card interactive icon="upload" heading="Import a novel">
            <ds-pill dsCardEnd kind="info">Soon</ds-pill>
            <p class="meta mb-0">Add a novel package to your library</p>
          </ds-card>
          <ds-card interactive icon="settings" heading="Settings">
            <p class="meta mb-0">Tab to see the focus ring</p>
          </ds-card>
        </div>
      </div>
    `,
  }),
};
