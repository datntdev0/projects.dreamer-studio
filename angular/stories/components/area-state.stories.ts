import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { AreaStateComponent } from '@components/state/area-state.component';

interface AreaStateArgs {
  emptyTitle: string;
  emptyDescription: string;
  loadingText: string;
  errorTitle: string;
  errorDescription: string;
  detailsLabel: string;
  details: string;
}

const meta: Meta<AreaStateArgs> = {
  title: 'Components/Area state',
  decorators: [moduleMetadata({ imports: [AreaStateComponent] })],
  args: {
    emptyTitle: 'No projects yet',
    emptyDescription: 'Create a project to start producing content.',
    loadingText: 'Loading projects...',
    errorTitle: 'Could not load projects',
    errorDescription: 'Check your connection and try again.',
    detailsLabel: 'Details',
    details: 'Error: ECONNREFUSED 127.0.0.1:8000\n  at connect (net.js:1:1)',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="sb-doc">
        <section>
          <h3>Empty, loading, error</h3>
          <div class="sb-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))">
            <div class="sb-card"><ds-area-state kind="empty" icon="folder" [heading]="emptyTitle" [description]="emptyDescription" /></div>
            <div class="sb-card"><ds-area-state kind="loading" [heading]="loadingText" /></div>
            <div class="sb-card"><ds-area-state kind="error" [heading]="errorTitle" [description]="errorDescription" [details]="details" [detailsLabel]="detailsLabel" /></div>
          </div>
        </section>
        <section>
          <h3>Compact (cards)</h3>
          <div class="sb-grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))">
            <div class="sb-card"><ds-area-state kind="empty" icon="folder" [heading]="emptyTitle" [description]="emptyDescription" [compact]="true" /></div>
            <div class="sb-card"><ds-area-state kind="loading" [heading]="loadingText" [compact]="true" /></div>
            <div class="sb-card"><ds-area-state kind="error" [heading]="errorTitle" [description]="errorDescription" [details]="details" [detailsLabel]="detailsLabel" [compact]="true" /></div>
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const English: StoryObj<AreaStateArgs> = {};

export const Vietnamese: StoryObj<AreaStateArgs> = {
  args: {
    emptyTitle: 'Chưa có dự án nào',
    emptyDescription: 'Tạo một dự án để bắt đầu sản xuất nội dung.',
    loadingText: 'Đang tải dự án...',
    errorTitle: 'Không thể tải dự án',
    errorDescription: 'Kiểm tra kết nối và thử lại.',
    detailsLabel: 'Chi tiết',
  },
};
