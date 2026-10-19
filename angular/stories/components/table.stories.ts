import type { Meta, StoryObj } from '@storybook/angular';

interface TableArgs {
  name: string;
  statusHeader: string;
  status: string;
  started: string;
  duration: string;
  emptyText: string;
}

const meta: Meta<TableArgs> = {
  title: 'Components/Table',
  args: {
    name: 'Demo pipeline',
    statusHeader: 'Status',
    status: 'Succeeded',
    started: 'Started',
    duration: 'Duration',
    emptyText: 'No runs match the filter.',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="sb-doc">
        <section>
          <h3>Data (rows highlight on hover)</h3>
          <div class="ds-table-wrap"><table class="ds-table">
            <thead><tr><th>{{ name }}</th><th>{{ statusHeader }}</th><th class="num">{{ started }}</th><th class="num">{{ duration }}</th></tr></thead>
            <tbody>
              <tr><td>{{ name }} #5</td><td>{{ status }}</td><td class="num">10:42</td><td class="num">01:12</td></tr>
              <tr><td>{{ name }} #4</td><td>{{ status }}</td><td class="num">09:15</td><td class="num">00:41</td></tr>
            </tbody>
          </table></div>
        </section>
        <section>
          <h3>Dense flush (sticky header, current row)</h3>
          <table class="ds-table dense">
            <thead><tr><th>{{ name }}</th><th>{{ statusHeader }}</th><th class="num">{{ started }}</th><th class="num">{{ duration }}</th></tr></thead>
            <tbody>
              <tr tabindex="0" aria-current="true" data-testid="table-dense-current"><td>{{ name }} #5</td><td>{{ status }}</td><td class="num">10:42</td><td class="num">01:12</td></tr>
              <tr tabindex="0"><td>{{ name }} #4</td><td>{{ status }}</td><td class="num">09:15</td><td class="num">00:41</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>Empty row</h3>
          <div class="ds-table-wrap"><table class="ds-table">
            <thead><tr><th>{{ name }}</th><th>{{ statusHeader }}</th></tr></thead>
            <tbody><tr><td class="ds-table-empty" colspan="2" data-testid="table-empty">{{ emptyText }}</td></tr></tbody>
          </table></div>
        </section>
        <section>
          <h3>Loading rows</h3>
          <div class="ds-table-wrap" aria-busy="true"><table class="ds-table">
            <thead><tr><th>{{ name }}</th><th>{{ statusHeader }}</th><th class="num">{{ started }}</th><th class="num">{{ duration }}</th></tr></thead>
            <tbody>
              <tr><td><div class="skeleton" style="width: 140px"></div></td><td><div class="skeleton" style="width: 72px"></div></td><td><div class="skeleton" style="width: 56px; margin-left: auto"></div></td><td><div class="skeleton" style="width: 40px; margin-left: auto"></div></td></tr>
              <tr><td><div class="skeleton" style="width: 120px"></div></td><td><div class="skeleton" style="width: 72px"></div></td><td><div class="skeleton" style="width: 56px; margin-left: auto"></div></td><td><div class="skeleton" style="width: 40px; margin-left: auto"></div></td></tr>
            </tbody>
          </table></div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const English: StoryObj<TableArgs> = {};

export const Vietnamese: StoryObj<TableArgs> = {
  args: {
    name: 'Quy trình mẫu',
    statusHeader: 'Trạng thái',
    status: 'Thành công',
    started: 'Bắt đầu',
    duration: 'Thời lượng',
    emptyText: 'Không có lần chạy nào khớp bộ lọc.',
  },
};
