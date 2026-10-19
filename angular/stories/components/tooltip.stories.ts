import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';

interface TooltipArgs {
  text: string;
  truncated: string;
}

const meta: Meta<TooltipArgs> = {
  title: 'Components/Tooltip',
  decorators: [moduleMetadata({ imports: [TooltipDirective] })],
  args: { text: 'Library', truncated: 'A very long file name that does not fit in the box.mp4' },
  render: (args) => ({
    props: args,
    template: `
      <div class="sb-doc">
        <section>
          <h3>On hover and focus (Esc hides)</h3>
          <button class="ds-btn" type="button" [dsTooltip]="text">Hover or focus me</button>
        </section>
        <section>
          <h3>Only when truncated</h3>
          <div style="width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" tabindex="0" [dsTooltip]="truncated" [dsTooltipWhenTruncated]="true">{{ truncated }}</div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const English: StoryObj<TooltipArgs> = {};

export const Vietnamese: StoryObj<TooltipArgs> = {
  args: { text: 'Thư viện', truncated: 'Một tên tệp rất dài không thể hiển thị đầy đủ trong khung này.mp4' },
};
