import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, OnInit } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { DesktopApi } from '@core/desktop-api';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LlmStore } from '@core/stores/llm-store';
import { LLM_CLIS } from '@dreamer/shared/models/llm';
import type { LlmCliId, LlmCliStatus } from '@dreamer/shared/models/llm';
import { LlmProvidersSectionComponent } from '../../../src/features/settings/components/llm-providers-section.component';
import { fakeLlmApi, type FakeLlmApi, type LlmScenario } from '../../fixtures/desktop-api';
import { LLM_FEATURE_IDS, LLM_MODEL_SUGGESTIONS, LLM_STATE_MIXED } from '../../fixtures/llm';
import { LLM_STATE_NONE, LlmStoryStore } from '../../fixtures/llm';
import type { LlmChoice, LlmFeatureId, LlmStoryState } from '../../fixtures/llm';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

type SlotKey = 'default' | LlmFeatureId;

type ProblemKey = 'noDefault' | 'defaultUnavailable' | 'notInstalled' | 'invalidPath';

interface CliOption {
  value: string;
  label: string;
  disabled: boolean;
}

interface LlmProblem {
  key: ProblemKey;
  cli: string;
  showLink: boolean;
}

interface LlmSlot {
  key: SlotKey;
  choice: LlmChoice | null;
  inherited: LlmChoice | null;
  options: CliOption[];
  selectDisabled: boolean;
  suggestions: string[];
  problem: LlmProblem | null;
}

const PREFIX = 'settings.llm.features.';
const PROVIDERS_SELECTOR = '#settings-llm-providers, [data-testid="settings-llm-providers"]';

@Component({
  selector: 'ds-llm-features-preview',
  imports: [BannerComponent, ButtonDirective, IconComponent, NgTemplateOutlet, TranslatePipe],
  template: `
    <section
      id="settings-llm-features"
      class="settings-section llm-features"
      aria-labelledby="settings-llm-features-title"
      data-testid="settings-llm-features"
    >
      <header class="settings-section-head">
        <h3 id="settings-llm-features-title" tabindex="-1">{{ 'settings.llm.features.title' | t }}</h3>
        <div class="settings-section-actions">
          <button
            dsBtn
            variant="ghost"
            size="sm"
            type="button"
            data-testid="settings-llm-features-reset"
            (click)="reset()"
          >
            <ds-icon name="undo" size="sm" />{{ 'settings.page.reset' | t }}
          </button>
        </div>
      </header>
      @if (noCliInstalled()) {
        <ds-banner
          class="llm-features-notice"
          variant="info"
          [dismissible]="false"
          [heading]="'settings.llm.features.noCli.title' | t"
          [message]="'settings.llm.features.noCli.message' | t"
          [dismissLabel]="'common.dismiss' | t"
          data-testid="settings-llm-features-no-cli"
        >
          <button
            dsBtn
            size="sm"
            type="button"
            data-testid="settings-llm-features-no-cli-open"
            (click)="openProviders()"
          >
            <ds-icon name="arrow-up" size="sm" />{{ 'settings.llm.features.openProviders' | t }}
          </button>
        </ds-banner>
      }
      <div class="settings-group">
        <ng-container *ngTemplateOutlet="row; context: { $implicit: defaultSlot() }" />
      </div>
      <div class="settings-group">
        <h4>{{ 'settings.llm.features.perFeature' | t }}</h4>
        @for (slot of featureSlots(); track slot.key) {
          <ng-container *ngTemplateOutlet="row; context: { $implicit: slot }" />
        }
      </div>
    </section>

    <ng-template #row let-slot>
      <div
        class="settings-row llm-features-row"
        [id]="'settings-llm-feature-' + slot.key"
        [attr.data-state]="slot.problem ? 'warning' : null"
        [attr.data-testid]="'settings-llm-feature-' + slot.key"
      >
        <div class="settings-row-text">
          <label class="settings-row-label" [for]="'settings-llm-feature-' + slot.key + '-cli'">
            {{ prefix + 'slot.' + slot.key | t }}
          </label>
          <span class="settings-row-hint" [id]="'settings-llm-feature-' + slot.key + '-hint'">
            {{ prefix + 'slot.' + slot.key + 'Hint' | t }}
          </span>
          @if (slot.key !== 'default' && !slot.choice) {
            <span class="settings-row-hint" [attr.data-testid]="'settings-llm-feature-' + slot.key + '-inherited'">
              @if (slot.inherited; as llm) {
                {{ 'settings.llm.features.usesDefault' | t: { llm: describe(llm) } }}
              } @else {
                {{ 'settings.llm.features.noDefaultYet' | t }}
              }
            </span>
          }
          @if (slot.problem; as problem) {
            <span
              class="llm-features-warning"
              [id]="'settings-llm-feature-' + slot.key + '-warning'"
              [attr.data-testid]="'settings-llm-feature-' + slot.key + '-warning'"
            >
              <ds-icon name="alert-triangle" size="sm" />
              <span>
                {{ prefix + 'problem.' + problem.key | t: { cli: problem.cli } }}
                @if (problem.showLink) {
                  <button
                    type="button"
                    class="llm-features-link"
                    [attr.data-testid]="'settings-llm-feature-' + slot.key + '-open-providers'"
                    (click)="openProviders()"
                  >
                    {{ 'settings.llm.features.openProviders' | t }}
                  </button>
                }
              </span>
            </span>
          }
        </div>
        <div class="settings-row-control llm-features-control">
          <span class="ds-select llm-features-cli">
            <select
              class="ds-input"
              [id]="'settings-llm-feature-' + slot.key + '-cli'"
              [disabled]="slot.selectDisabled"
              [attr.aria-describedby]="describedBy(slot)"
              [attr.data-testid]="'settings-llm-feature-' + slot.key + '-cli'"
              (change)="setCli(slot, $event)"
            >
              @for (option of slot.options; track option.value) {
                <option
                  [value]="option.value"
                  [disabled]="option.disabled"
                  [selected]="option.value === (slot.choice?.cli ?? '')"
                >
                  {{ option.label }}
                </option>
              }
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
          <input
            class="ds-input mono llm-features-model"
            autocomplete="off"
            spellcheck="false"
            [attr.list]="slot.choice ? 'settings-llm-feature-' + slot.key + '-models' : null"
            [disabled]="!slot.choice"
            [value]="(slot.choice ?? slot.inherited)?.model ?? ''"
            [placeholder]="'settings.llm.features.cliDefault' | t"
            [attr.aria-label]="'settings.llm.features.modelLabel' | t: { name: prefix + 'slot.' + slot.key | t }"
            [attr.data-testid]="'settings-llm-feature-' + slot.key + '-model'"
            (change)="setModel(slot, $event)"
          />
          <datalist [id]="'settings-llm-feature-' + slot.key + '-models'">
            @for (model of slot.suggestions; track model) {
              <option [value]="model"></option>
            }
          </datalist>
        </div>
      </div>
    </ng-template>
  `,
})
class LlmFeaturesPreviewComponent {
  protected readonly state = inject(LlmStoryStore).state;
  protected readonly prefix = PREFIX;

  private readonly i18n: I18nService = inject(I18nService);
  private readonly llm: LlmStore = inject(LlmStore);

  protected readonly noCliInstalled = computed<boolean>(() => {
    const statuses: LlmCliStatus[] | null = this.llm.statuses();
    return statuses !== null && statuses.every((cli: LlmCliStatus): boolean => cli.state !== 'installed');
  });

  protected readonly defaultSlot = computed<LlmSlot>(() =>
    this.slot(this.state(), 'default', this.state().defaultChoice),
  );

  protected readonly featureSlots = computed<LlmSlot[]>(() => {
    const state: LlmStoryState = this.state();
    return LLM_FEATURE_IDS.map((feature: LlmFeatureId): LlmSlot => {
      const choice: LlmChoice | null = state.features.find((item) => item.feature === feature)?.choice ?? null;
      return this.slot(state, feature, choice);
    });
  });

  protected describe(choice: LlmChoice): string {
    const model: string = choice.model ?? this.i18n.t(`${PREFIX}cliDefault`);
    return `${this.cliName(choice.cli)} · ${model}`;
  }

  protected describedBy(slot: LlmSlot): string {
    const base = `settings-llm-feature-${slot.key}-hint`;
    return slot.problem ? `${base} settings-llm-feature-${slot.key}-warning` : base;
  }

  protected setCli(slot: LlmSlot, event: Event): void {
    const value: string = (event.target as HTMLSelectElement).value;
    this.write(slot.key, value ? { cli: value as LlmCliId, model: null } : null);
  }

  protected setModel(slot: LlmSlot, event: Event): void {
    if (!slot.choice) return;
    const model: string = (event.target as HTMLInputElement).value.trim();
    this.write(slot.key, { ...slot.choice, model: model || null });
  }

  protected reset(): void {
    this.state.update((state: LlmStoryState): LlmStoryState => ({
      ...state,
      features: LLM_FEATURE_IDS.map((feature: LlmFeatureId) => ({ feature, choice: null })),
    }));
  }

  protected openProviders(): void {
    const target: HTMLElement | null = document.querySelector(PROVIDERS_SELECTOR);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private write(key: SlotKey, choice: LlmChoice | null): void {
    this.state.update((state: LlmStoryState): LlmStoryState => {
      if (key === 'default') return { ...state, defaultChoice: choice };
      return { ...state, features: state.features.map((item) => (item.feature === key ? { ...item, choice } : item)) };
    });
  }

  private slot(state: LlmStoryState, key: SlotKey, choice: LlmChoice | null): LlmSlot {
    const isDefault: boolean = key === 'default';
    const options: CliOption[] = this.options(isDefault, choice);
    const current: string = choice?.cli ?? '';
    return {
      key,
      choice,
      inherited: isDefault ? null : state.defaultChoice,
      options,
      selectDisabled: !options.some((option: CliOption): boolean => !option.disabled && option.value !== current),
      suggestions: choice ? LLM_MODEL_SUGGESTIONS[choice.cli] : [],
      problem: this.problem(state, isDefault, choice),
    };
  }

  private options(isDefault: boolean, choice: LlmChoice | null): CliOption[] {
    const installed: boolean = !this.noCliInstalled();
    const first: CliOption = isDefault
      ? { value: '', label: this.text(installed ? 'chooseCli' : 'noCliOption'), disabled: true }
      : { value: '', label: this.text('useDefault'), disabled: false };
    const clis: CliOption[] = (this.llm.statuses() ?? [])
      .filter((cli: LlmCliStatus): boolean => cli.state === 'installed' || cli.id === choice?.cli)
      .map((cli: LlmCliStatus): CliOption => {
        const available: boolean = cli.state === 'installed';
        const name: string = LLM_CLIS[cli.id].name;
        const label: string = available ? name : this.text(`unavailableOption.${cli.state}`, { cli: name });
        return { value: cli.id, label, disabled: !available };
      });
    return [first, ...clis];
  }

  private problem(state: LlmStoryState, isDefault: boolean, choice: LlmChoice | null): LlmProblem | null {
    if (choice) {
      const cli: LlmCliStatus | undefined = this.llm
        .statuses()
        ?.find((item: LlmCliStatus): boolean => item.id === choice.cli);
      if (!cli || cli.state === 'installed') return null;
      return { key: cli.state, cli: LLM_CLIS[cli.id].name, showLink: true };
    }
    if (isDefault) {
      return this.noCliInstalled() ? null : { key: 'noDefault', cli: '', showLink: false };
    }
    const fallback: LlmChoice | null = state.defaultChoice;
    if (!fallback || !this.problem(state, true, fallback)) return null;
    return { key: 'defaultUnavailable', cli: this.cliName(fallback.cli), showLink: false };
  }

  private cliName(id: LlmCliId): string {
    return LLM_CLIS[id].name;
  }

  private text(key: string, params?: Record<string, string>): string {
    return this.i18n.t(`${PREFIX}${key}`, params);
  }
}

@Component({
  selector: 'ds-settings-llm-story-host',
  imports: [IconComponent, LlmFeaturesPreviewComponent, LlmProvidersSectionComponent, TranslatePipe],
  providers: [LlmStoryStore, LlmStore, { provide: DesktopApi, useFactory: (): FakeLlmApi => fakeLlmApi('mixed') }],
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
            <ds-llm-features-preview />
          </div>
        </div>
      </div>
    </div>
  `,
})
class SettingsLlmStoryHostComponent implements OnInit {
  readonly initial = input<LlmStoryState>(LLM_STATE_MIXED);
  readonly scenario = input<LlmScenario>('mixed');

  private readonly store: LlmStoryStore = inject(LlmStoryStore);
  private readonly api: FakeLlmApi = inject(DesktopApi) as FakeLlmApi;

  ngOnInit(): void {
    this.store.state.set(this.initial());
    this.api.setScenario(this.scenario());
  }
}

export default {
  title: 'Pages/Settings/LLM',
  parameters: { layout: 'fullscreen' },
  args: { initial: LLM_STATE_MIXED, scenario: 'mixed' },
  decorators: [moduleMetadata({ imports: [SettingsLlmStoryHostComponent] })],
  render: (args) => ({
    props: args,
    template: '<ds-settings-llm-story-host [initial]="initial" [scenario]="scenario" />',
  }),
} satisfies Meta<{ initial: LlmStoryState; scenario: LlmScenario }>;

type Story = StoryObj<{ initial: LlmStoryState; scenario: LlmScenario }>;

export const Main: Story = {};

export const NoCliInstalled: Story = {
  args: { initial: LLM_STATE_NONE, scenario: 'none' },
};
