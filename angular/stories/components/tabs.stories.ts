import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { TabItem, TabsComponent } from '@components/tabs/tabs.component';

const PLAIN_TABS: TabItem[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'history', label: 'History' },
];
const COUNT_TABS: TabItem[] = [
  { id: 'queue', label: 'Queue', count: 3 },
  { id: 'history', label: 'History', count: 128 },
  { id: 'failed', label: 'Failed', count: null },
];

const meta: Meta = {
  title: 'Components/Tabs',
  decorators: [moduleMetadata({ imports: [TabsComponent] })],
};

export default meta;

export const Default: StoryObj = {
  render: () => ({
    props: { tabs: PLAIN_TABS },
    template: `
      <div class="sb-doc">
        <div class="ds-page-toolbar"><ds-tabs label="Views" [tabs]="tabs" value="queue" /></div>
      </div>
    `,
  }),
};

export const WithCounts: StoryObj = {
  render: () => ({
    props: { tabs: COUNT_TABS },
    template: `
      <div class="sb-doc">
        <div class="ds-page-toolbar"><ds-tabs label="Views" [tabs]="tabs" value="history" /></div>
      </div>
    `,
  }),
};

export const Keyboard: StoryObj = {
  render: () => ({
    props: { tabs: COUNT_TABS },
    template: `
      <div class="sb-doc">
        <p>Focus a tab, then use Left, Right, Home and End to move and select.</p>
        <div class="ds-page-toolbar"><ds-tabs label="Views" [tabs]="tabs" #strip value="queue" /></div>
        <p>Selected: {{ strip.value() }}</p>
      </div>
    `,
  }),
};
