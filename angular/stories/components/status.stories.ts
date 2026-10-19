import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { BadgeComponent } from '@components/status/badge.component';
import { DotComponent } from '@components/status/dot.component';
import { PillComponent } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';

const PILLS: { kind: string; icon: string | null; label: string }[] = [
  { kind: 'neutral', icon: 'clock', label: 'Queued' },
  { kind: 'info', icon: 'info', label: 'Running' },
  { kind: 'success', icon: 'check', label: 'Succeeded' },
  { kind: 'warning', icon: 'alert-triangle', label: 'Warning' },
  { kind: 'danger', icon: 'alert-circle', label: 'Failed' },
];
const DOTS: string[] = ['neutral', 'primary', 'success', 'warning', 'danger'];

const meta: Meta = {
  title: 'Components/Status',
  decorators: [moduleMetadata({ imports: [PillComponent, BadgeComponent, DotComponent, ProgressComponent] })],
};

export default meta;

export const Pills: StoryObj = {
  render: () => ({
    props: { pills: PILLS },
    template: `
      <div class="sb-doc">
        <section>
          <h3>With icon</h3>
          <div class="sb-row">
            @for (pill of pills; track pill.kind) {
              <ds-pill [kind]="pill.kind" [icon]="pill.icon">{{ pill.label }}</ds-pill>
            }
          </div>
        </section>
        <section>
          <h3>Text only</h3>
          <div class="sb-row">
            @for (pill of pills; track pill.kind) {
              <ds-pill [kind]="pill.kind">{{ pill.label }}</ds-pill>
            }
          </div>
        </section>
      </div>
    `,
  }),
};

export const Badges: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <ds-badge>3</ds-badge>
          <ds-badge>12</ds-badge>
          <ds-badge>99+</ds-badge>
          <ds-badge>New</ds-badge>
        </div>
      </div>
    `,
  }),
};

export const Dots: StoryObj = {
  render: () => ({
    props: { dots: DOTS },
    template: `
      <div class="sb-doc">
        <section>
          <h3>Static</h3>
          <div class="sb-row">
            @for (dot of dots; track dot) {
              <span class="d-inline-flex align-items-center gap-2"><ds-dot [kind]="dot" />{{ dot }}</span>
            }
          </div>
        </section>
        <section>
          <h3>Pulse</h3>
          <div class="sb-row">
            <span class="d-inline-flex align-items-center gap-2"><ds-dot kind="primary" pulse />Running</span>
          </div>
        </section>
      </div>
    `,
  }),
};

export const Progress: StoryObj = {
  render: () => ({
    template: `
      <div class="sb-doc">
        <section>
          <h3>Determinate</h3>
          <div class="d-grid gap-3">
            <ds-progress [value]="0" />
            <ds-progress [value]="35" />
            <ds-progress [value]="72" />
            <ds-progress [value]="100" />
          </div>
        </section>
        <section>
          <h3>Indeterminate</h3>
          <ds-progress [value]="null" />
        </section>
      </div>
    `,
  }),
};
