import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';

interface ListArgs {
  title: string;
  loading: boolean;
}

const meta: Meta<ListArgs> = {
  title: 'Layout/List',
  parameters: { layout: 'fullscreen' },
  decorators: [moduleMetadata({ imports: [ButtonDirective, IconComponent, PillComponent] })],
  args: { title: 'Projects', loading: false },
  render: (args) => ({
    props: args,
    template: `
      <div style="height: 100vh">
        <section class="ds-page">
          <div class="ds-page-toolbar">
            <h1>{{ title }}</h1>
            <input class="ds-input" type="search" placeholder="Filter projects" aria-label="Filter projects" />
            <div class="ds-page-actions"><button dsBtn variant="primary" size="sm"><ds-icon name="plus" size="sm" />New project</button></div>
          </div>
          <div class="ds-page-body">
            <div class="ds-table-wrap" [attr.aria-busy]="loading">
              <table class="ds-table">
                <thead><tr><th>Name</th><th>Status</th><th class="num">Updated</th><th class="num">Items</th></tr></thead>
                <tbody>
                  @if (loading) {
                    @for (row of [1, 2, 3, 4, 5]; track row) {
                      <tr><td><div class="skeleton" style="width: 160px"></div></td><td><div class="skeleton" style="width: 72px"></div></td><td><div class="skeleton" style="width: 56px; margin-left: auto"></div></td><td><div class="skeleton" style="width: 32px; margin-left: auto"></div></td></tr>
                    }
                  } @else {
                    <tr><td>Hành trình của một giấc mơ</td><td><ds-pill kind="success">Done</ds-pill></td><td class="num">10:42</td><td class="num">24</td></tr>
                    <tr><td>Demo pipeline</td><td><ds-pill kind="info">Running</ds-pill></td><td class="num">09:15</td><td class="num">8</td></tr>
                    <tr><td>Draft translation</td><td><ds-pill kind="warning">Paused</ds-pill></td><td class="num">Yesterday</td><td class="num">12</td></tr>
                    <tr><td>Archive</td><td><ds-pill>Idle</ds-pill></td><td class="num">Mon</td><td class="num">3</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Default: StoryObj<ListArgs> = {};

export const Loading: StoryObj<ListArgs> = { args: { loading: true } };

export const VietnameseTitle: StoryObj<ListArgs> = {
  args: { title: 'Danh sách các dự án dịch thuật tiểu thuyết đang thực hiện và đã hoàn thành trong năm nay' },
};
