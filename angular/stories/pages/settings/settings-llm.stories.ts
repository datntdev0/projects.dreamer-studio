import { Component, inject, OnInit } from '@angular/core';
import { provideRouter } from '@angular/router';
import { IconComponent } from '@components/icon/icon.component';
import { DesktopApi } from '@core/desktop-api';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LlmStore } from '@core/stores/llm-store';
import { SettingsStore } from '@core/stores/settings-store';
import { defaultLlmSettings } from '@dreamer/shared/models/llm';
import type { LlmSettings } from '@dreamer/shared/models/llm';
import { LlmFeaturesSectionComponent } from '../../../src/features/settings/components/llm-features-section.component';
import { LlmProvidersSectionComponent } from '../../../src/features/settings/components/llm-providers-section.component';
import { fakeLlmApi, fakeSettingsApi } from '../../fixtures/desktop-api';
import type { LlmScenario } from '../../fixtures/desktop-api';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

interface LlmStoryArgs {
  initial: LlmSettings;
  scenario: LlmScenario;
}

const MAIN_SETTINGS: LlmSettings = {
  ...defaultLlmSettings(),
  default: { cli: 'claude', model: 'claude-sonnet-5-5' },
  features: {
    worldAnalysis: { cli: 'claude', model: 'claude-opus-5-5' },
    contentTranslation: { cli: 'codex', model: null },
  },
};

@Component({
  selector: 'ds-settings-llm-story-host',
  imports: [IconComponent, LlmFeaturesSectionComponent, LlmProvidersSectionComponent, TranslatePipe],
  template: `
    <div class="ds-page settings-page" style="height: 100vh">
      <div class="ds-page-toolbar">
        <h1>{{ 'nav.settings' | t }}</h1>
      </div>
      <div class="settings-layout">
        <nav class="settings-nav">
          <span class="settings-nav-item"
            ><ds-icon name="sliders" /><span class="label">{{ 'settings.page.nav.general' | t }}</span></span
          >
          <span class="settings-nav-item"
            ><ds-icon name="shield" /><span class="label">{{ 'settings.page.nav.diagnostics' | t }}</span></span
          >
          <span class="settings-nav-item" aria-current="page"
            ><ds-icon name="sparkles" /><span class="label">{{ 'settings.page.nav.llm' | t }}</span></span
          >
        </nav>
        <div class="settings-main">
          <div class="settings-content" data-testid="settings-llm-pane">
            <ds-settings-llm-providers />
            <ds-settings-llm-features />
          </div>
        </div>
      </div>
    </div>
  `,
})
class SettingsLlmStoryHostComponent implements OnInit {
  private readonly settings: SettingsStore = inject(SettingsStore);

  ngOnInit(): void {
    void this.settings.load();
  }
}

export default {
  title: 'Pages/Settings/LLM',
  parameters: { layout: 'fullscreen' },
  args: { initial: MAIN_SETTINGS, scenario: 'mixed' },
  decorators: [moduleMetadata({ imports: [SettingsLlmStoryHostComponent] })],
  render: (args: LlmStoryArgs) => ({
    applicationConfig: {
      providers: [
        provideRouter([]),
        {
          provide: DesktopApi,
          useValue: { ...fakeLlmApi(args.scenario), ...fakeSettingsApi({ llm: args.initial }) },
        },
        SettingsStore,
        LlmStore,
      ],
    },
    template: '<ds-settings-llm-story-host />',
  }),
} satisfies Meta<LlmStoryArgs>;

type Story = StoryObj<LlmStoryArgs>;

export const Main: Story = {};

export const NoCliInstalled: Story = {
  args: { initial: defaultLlmSettings(), scenario: 'none' },
};
