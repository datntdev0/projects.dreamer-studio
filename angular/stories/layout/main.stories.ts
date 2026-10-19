import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { SplitterDirective } from '@components/splitter/splitter.directive';
import { DotComponent } from '@components/status/dot.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';

type BackendState = 'ready' | 'starting' | 'failed';

interface MainLayoutArgs {
  railCollapsed: boolean;
  leftPanel: boolean;
  rightPanel: boolean;
  bottomPanel: boolean;
  backend: BackendState;
  pipelineRunning: boolean;
  toast: boolean;
}

interface RailEntry {
  icon: string;
  label: string;
  current?: boolean;
}

interface RailGroup {
  title: string;
  entries: RailEntry[];
}

const RAIL_TOP: RailGroup[] = [
  {
    title: 'Library',
    entries: [
      { icon: 'home', label: 'Home', current: true },
      { icon: 'library', label: 'Library' },
    ],
  },
  { title: 'Analysis', entries: [{ icon: 'network', label: 'Analysis' }] },
  { title: 'Production', entries: [{ icon: 'box', label: 'Projects' }] },
];

const RAIL_BOTTOM: RailGroup[] = [
  {
    title: 'System',
    entries: [
      { icon: 'tasks', label: 'Pipelines' },
      { icon: 'settings', label: 'Settings' },
    ],
  },
];

const meta: Meta<MainLayoutArgs> = {
  title: 'Layout/Main',
  parameters: { layout: 'fullscreen' },
  decorators: [
    moduleMetadata({
      imports: [ButtonDirective, IconComponent, AreaStateComponent, DotComponent, SplitterDirective, TooltipDirective],
    }),
  ],
  args: {
    railCollapsed: false,
    leftPanel: false,
    rightPanel: false,
    bottomPanel: false,
    backend: 'ready',
    pipelineRunning: false,
    toast: false,
  },
  render: (args) => ({
    props: { ...args, railTop: RAIL_TOP, railBottom: RAIL_BOTTOM },
    template: `
      <div style="width: 100vw; height: 100vh">
        <div class="ds-app" [class.rail-collapsed]="railCollapsed">
          <header class="ds-app-top">
            <button class="ds-app-brand" type="button" (click)="railCollapsed = !railCollapsed">
              <img class="ds-brand-mark ds-only-dark" src="brand/dreamer-studio-mark-dark.svg" alt="" />
              <img class="ds-brand-mark ds-only-light" src="brand/dreamer-studio-mark-light.svg" alt="" />
              <span>Dreamer Studio</span><span class="version">v0.0.0</span>
            </button>
            <nav class="ds-app-crumbs" aria-label="Breadcrumb">
              <span>Library</span><span class="sep">·</span><span class="page">Home</span>
            </nav>
            <span class="ds-spacer"></span>
            <span class="ds-app-tools">
              <button dsBtn class="lang" variant="ghost" size="sm" type="button" aria-label="Language" dsTooltip="Language">
                <ds-icon name="languages" size="sm" />EN
              </button>
              <button dsBtn variant="ghost" [iconOnly]="true" type="button" aria-label="Theme" dsTooltip="Theme">
                <ds-icon class="ds-only-light" name="sun" /><ds-icon class="ds-only-dark" name="moon" />
              </button>
              <button dsBtn variant="ghost" [iconOnly]="true" type="button" aria-label="Settings" dsTooltip="Settings">
                <ds-icon name="settings" />
              </button>
            </span>
          </header>

          <nav class="ds-app-rail" aria-label="Modules">
            @for (group of railTop; track group.title; let first = $first) {
              <div class="ds-rail-group">
                @if (!first) { <span class="ds-rail-sep"></span> }
                <span class="ds-rail-title">{{ group.title }}</span>
                @for (entry of group.entries; track entry.label) {
                  <button class="ds-rail-entry" type="button" [attr.aria-label]="entry.label" [attr.aria-current]="entry.current ? 'page' : null" [dsTooltip]="railCollapsed ? entry.label : ''">
                    <ds-icon [name]="entry.icon" />
                    <span class="label" [dsTooltip]="railCollapsed ? '' : entry.label" dsTooltipWhenTruncated>{{ entry.label }}</span>
                  </button>
                }
              </div>
            }
            <div class="ds-rail-bottom">
              @for (group of railBottom; track group.title) {
                <div class="ds-rail-group">
                  <span class="ds-rail-sep"></span>
                  <span class="ds-rail-title">{{ group.title }}</span>
                  @for (entry of group.entries; track entry.label) {
                    <button class="ds-rail-entry" type="button" [attr.aria-label]="entry.label" [dsTooltip]="railCollapsed ? entry.label : ''">
                      <ds-icon [name]="entry.icon" />
                      <span class="label" [dsTooltip]="railCollapsed ? '' : entry.label" dsTooltipWhenTruncated>{{ entry.label }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          </nav>

          <main class="ds-app-main">
            @if (leftPanel) {
              <aside #left class="ds-panel-left" aria-label="Left panel"><h3>Left panel</h3><p class="meta">272px by default</p></aside>
              <ds-splitter [target]="left" edge="left" label="Resize left panel" />
            }
            <div class="ds-app-center">
              <section class="ds-page">
                <div class="ds-page-toolbar">
                  <h1>Home</h1>
                  <div class="ds-page-actions"><button dsBtn variant="primary" size="sm"><ds-icon name="plus" size="sm" />New item</button></div>
                </div>
                <div class="ds-page-body center">
                  <ds-area-state kind="empty" icon="inbox" heading="Page content" description="The homepage content comes with REQ-003." />
                </div>
              </section>
              @if (bottomPanel) {
                <ds-splitter [target]="bottom" edge="bottom" label="Resize bottom panel" />
                <aside #bottom class="ds-panel-bottom" aria-label="Bottom panel"><h3>Bottom panel</h3><p class="meta">208px by default</p></aside>
              }
            </div>
            @if (rightPanel) {
              <ds-splitter [target]="right" edge="right" label="Resize right panel" />
              <aside #right class="ds-panel-right" aria-label="Right panel"><h3>Right panel</h3><p class="meta">304px by default</p></aside>
            }
          </main>

          <footer class="ds-app-status">
            <span class="item path" title="C:\\Users\\me\\AppData\\Local\\DreamerStudio">
              <ds-icon name="folder" size="sm" /><span>C:\\Users\\me\\AppData\\Local\\DreamerStudio</span>
            </span>
            <button class="item" type="button">
              @if (pipelineRunning) {
                <ds-dot kind="primary" pulse /><span>Demo pipeline #5 · 42% · Step 2 of 5 · 1 queued</span>
              } @else {
                <ds-dot /><span>No running pipelines</span>
              }
            </button>
            @if (backend === 'starting') {
              <span class="item"><ds-dot kind="warning" pulse /><span>Starting local backend…</span></span>
            }
            @if (backend === 'failed') {
              <span class="item"><ds-dot kind="warning" /><span>AI backend failed</span></span>
            }
            <span class="ds-spacer"></span>
            <span class="item">EN · <span class="ds-only-dark">dark</span><span class="ds-only-light">light</span></span>
          </footer>

          @if (toast) {
            <div class="ds-toast-area" aria-live="polite">
              <div class="ds-toast success" role="status">
                <ds-icon name="check" />
                <div class="toast-text">
                  <span class="toast-title">Pipeline succeeded</span>
                  <span class="toast-msg">Demo pipeline #5 finished in 01:12.</span>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    `,
  }),
};

export default meta;

type Story = StoryObj<MainLayoutArgs>;

export const Default: Story = {};

export const RailCollapsed: Story = { args: { railCollapsed: true } };

export const AllPanels: Story = { args: { leftPanel: true, rightPanel: true, bottomPanel: true } };

export const BackendStarting: Story = { args: { backend: 'starting' } };

export const BackendFailed: Story = { args: { backend: 'failed' } };

export const PipelineRunning: Story = { args: { pipelineRunning: true } };

export const WithToast: Story = { args: { toast: true } };
