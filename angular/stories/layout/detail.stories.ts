import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { CardComponent } from '@components/card/card.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';

interface DetailArgs {
  title: string;
}

const meta: Meta<DetailArgs> = {
  title: 'Layout/Detail',
  parameters: { layout: 'fullscreen' },
  decorators: [moduleMetadata({ imports: [ButtonDirective, CardComponent, IconComponent, PillComponent] })],
  args: { title: 'Demo pipeline' },
  render: (args) => ({
    props: args,
    template: `
      <div style="height: 100vh">
        <section class="ds-page">
          <div class="ds-page-toolbar">
            <button dsBtn variant="ghost" size="sm" [iconOnly]="true" aria-label="Back"><ds-icon name="arrow-left" /></button>
            <h1>{{ title }}</h1>
            <ds-pill kind="success" icon="check">Done</ds-pill>
            <div class="ds-page-actions">
              <button dsBtn size="sm"><ds-icon name="pencil" size="sm" />Edit</button>
              <button dsBtn variant="danger" size="sm"><ds-icon name="trash" size="sm" />Delete</button>
            </div>
          </div>
          <div class="ds-page-body narrow">
            <div class="ds-page-stack">
              <ds-card icon="folder" heading="Summary">
                <p class="muted">A short description of the item, shown at the top of the page.</p>
                <dl class="ds-meta-list">
                  <dt>Created</dt><dd>2026-10-18 10:42</dd>
                  <dt>Owner</dt><dd>Dat</dd>
                  <dt>Language</dt><dd><ds-pill>zh-CN</ds-pill> <ds-pill kind="info">vi</ds-pill></dd>
                </dl>
              </ds-card>
              <section>
                <h2>Steps</h2>
                <div class="ds-table-wrap"><table class="ds-table">
                  <thead><tr><th>Step</th><th>Status</th><th class="num">Duration</th></tr></thead>
                  <tbody>
                    <tr><td>Import</td><td><ds-pill kind="success">Done</ds-pill></td><td class="num">00:12</td></tr>
                    <tr><td>Translate</td><td><ds-pill kind="success">Done</ds-pill></td><td class="num">01:12</td></tr>
                  </tbody>
                </table></div>
              </section>
              <section>
                <h2>Notes</h2>
                <p>Free text section with <span class="meta">metadata</span> in the secondary style.</p>
              </section>
            </div>
          </div>
        </section>
      </div>
    `,
  }),
};

export default meta;

export const Default: StoryObj<DetailArgs> = {};

export const LongVietnameseTitle: StoryObj<DetailArgs> = {
  args: { title: 'Quy trình dịch thuật tiểu thuyết dài nhiều tập với nhiều bước xử lý và kiểm tra chất lượng' },
};
