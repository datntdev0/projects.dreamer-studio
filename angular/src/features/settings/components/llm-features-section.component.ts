import { NgTemplateOutlet } from '@angular/common';
import { afterRenderEffect, Component, computed, ElementRef, inject, OnInit, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { ComboboxComponent } from '@components/form/combobox.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LlmStore } from '@core/stores/llm-store';
import { SettingsStore } from '@core/stores/settings-store';
import { checkLlmChoice, formatLlmChoice, LLM_CLIS, LLM_FEATURE_IDS } from '@dreamer/shared/models/llm';
import { LLM_MODEL_SUGGESTIONS, resolveLlm } from '@dreamer/shared/models/llm';
import type { LlmChoice, LlmCliId, LlmCliStatus, LlmFeatureId } from '@dreamer/shared/models/llm';
import type { LlmProblem, LlmSettings } from '@dreamer/shared/models/llm';
import { SettingsReset } from '../settings-reset';

type SlotKey = 'default' | LlmFeatureId;

interface CliOption {
  value: string;
  label: string;
  disabled: boolean;
}

interface SlotProblem {
  key: LlmProblem;
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
  problem: SlotProblem | null;
}

const PREFIX: string = `settings.llm.features.`;

@Component({
  selector: 'ds-settings-llm-features',
  imports: [BannerComponent, ButtonDirective, ComboboxComponent, IconComponent, NgTemplateOutlet, TranslatePipe],
  templateUrl: './llm-features-section.component.html',
})
export class LlmFeaturesSectionComponent implements OnInit {
  private readonly settings: SettingsStore = inject(SettingsStore);
  private readonly llm: LlmStore = inject(LlmStore);
  private readonly resetService: SettingsReset = inject(SettingsReset);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly fragment: Signal<string | null> = toSignal(this.route.fragment, {
    initialValue: this.route.snapshot.fragment,
  });

  protected readonly prefix: string = PREFIX;
  protected readonly noCliInstalled: Signal<boolean> = computed(() => this.llm.summary() === 'none');
  protected readonly defaultSlot: Signal<LlmSlot> = computed(() => {
    const settings: LlmSettings | undefined = this.settings.settings()?.llm;
    return this.slot('default', settings?.default ?? null, settings ?? null);
  });
  protected readonly featureSlots: Signal<LlmSlot[]> = computed(() => {
    const settings: LlmSettings | undefined = this.settings.settings()?.llm;
    return LLM_FEATURE_IDS.map((feature: LlmFeatureId): LlmSlot =>
      this.slot(feature, settings?.features[feature] ?? null, settings ?? null),
    );
  });

  constructor() {
    afterRenderEffect((): void => {
      const fragment: string | null = this.fragment();
      const keys: SlotKey[] = ['default', ...LLM_FEATURE_IDS];
      if (!fragment || !keys.some((key: SlotKey): boolean => fragment === `settings-llm-feature-${key}`)) return;
      const row: HTMLElement | null = this.host.nativeElement.querySelector(`#${fragment}`);
      if (!row) return;
      row.scrollIntoView({ block: 'start' });
      this.host.nativeElement
        .querySelector<HTMLElement>('#settings-llm-features-title')
        ?.focus({ preventScroll: true });
    });
  }

  ngOnInit(): void {
    void this.llm.load();
  }

  protected describe(choice: LlmChoice): string {
    return formatLlmChoice(choice, this.i18n.t(`${PREFIX}cliDefault`));
  }

  protected describedBy(slot: LlmSlot): string {
    const base: string = `settings-llm-feature-${slot.key}-hint`;
    return slot.problem ? `${base} settings-llm-feature-${slot.key}-warning` : base;
  }

  protected setCli(slot: LlmSlot, event: Event): void {
    const value: string = (event.target as HTMLSelectElement).value;
    void this.write(slot.key, value ? { cli: value as LlmCliId, model: null } : null);
  }

  protected async setModel(slot: LlmSlot, value: string, field: ComboboxComponent): Promise<void> {
    if (!slot.choice) return;
    if (!(await this.write(slot.key, { ...slot.choice, model: value || null }))) field.revert();
  }

  protected reset(): void {
    void this.resetService.run('llm');
  }

  protected openProviders(): void {
    document
      .querySelector<HTMLElement>('#settings-llm-providers')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private write(key: SlotKey, choice: LlmChoice | null): Promise<boolean> {
    const settings: LlmSettings | undefined = this.settings.settings()?.llm;
    if (!settings) return Promise.resolve(false);
    const previous: LlmChoice | null = key === 'default' ? settings.default : (settings.features[key] ?? null);
    if (previous?.cli === choice?.cli && previous?.model === choice?.model) return Promise.resolve(true);
    if (key === 'default') return this.settings.update({ llm: { default: choice } });
    const features: LlmSettings['features'] = { ...settings.features };
    if (choice) features[key] = choice;
    else delete features[key];
    return this.settings.update({ llm: { features } });
  }

  private slot(key: SlotKey, choice: LlmChoice | null, settings: LlmSettings | null): LlmSlot {
    const isDefault: boolean = key === 'default';
    const options: CliOption[] = this.options(isDefault, choice);
    const current: string = choice?.cli ?? '';
    const problem: LlmProblem | null = this.problem(key, choice, settings);
    const cli: LlmCliId | null =
      choice?.cli ?? (problem === 'defaultUnavailable' ? (settings?.default?.cli ?? null) : null);
    return {
      key,
      choice,
      inherited: isDefault ? null : (settings?.default ?? null),
      options,
      selectDisabled: !options.some((option: CliOption): boolean => !option.disabled && option.value !== current),
      suggestions: choice ? LLM_MODEL_SUGGESTIONS[choice.cli] : [],
      problem: problem
        ? {
            key: problem,
            cli: cli ? LLM_CLIS[cli].name : '',
            showLink: problem === 'notInstalled' || problem === 'invalidPath',
          }
        : null,
    };
  }

  private problem(key: SlotKey, choice: LlmChoice | null, settings: LlmSettings | null): LlmProblem | null {
    const statuses: LlmCliStatus[] | null = this.llm.statuses();
    if (!statuses || !settings) return null;
    if (key !== 'default') {
      const problem: LlmProblem | null = resolveLlm(settings, key, statuses).problem;
      return problem === 'noDefault' ? null : problem;
    }
    if (choice) return checkLlmChoice(choice, statuses);
    return this.noCliInstalled() ? null : 'noDefault';
  }

  private options(isDefault: boolean, choice: LlmChoice | null): CliOption[] {
    const first: CliOption = isDefault
      ? { value: '', label: this.text(this.noCliInstalled() ? 'noCliOption' : 'chooseCli'), disabled: true }
      : { value: '', label: this.text('useDefault'), disabled: false };
    const clis: CliOption[] = (this.llm.statuses() ?? [])
      .filter((cli: LlmCliStatus): boolean => cli.state === 'installed' || cli.id === choice?.cli)
      .map((cli: LlmCliStatus): CliOption => {
        const available: boolean = cli.state === 'installed';
        const name: string = LLM_CLIS[cli.id].name;
        return {
          value: cli.id,
          label: available ? name : this.text(`unavailableOption.${cli.state}`, { cli: name }),
          disabled: !available,
        };
      });
    return [first, ...clis];
  }

  private text(key: string, params?: Record<string, string>): string {
    return this.i18n.t(`${PREFIX}${key}`, params);
  }
}
