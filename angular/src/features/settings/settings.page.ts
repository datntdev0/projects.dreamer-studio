import { Component, computed, inject, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import type { SettingsState } from '@dreamer/shared/models/settings';
import { map } from 'rxjs';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { SettingsStore } from '@core/stores/settings-store';
import { PageTitleDirective } from '@shell/page-title.directive';
import { AboutSectionComponent } from './components/about-section.component';
import { DiagnosticsSectionComponent } from './components/diagnostics-section.component';
import { GeneralSectionComponent } from './components/general-section.component';
import { LlmProvidersSectionComponent } from './components/llm-providers-section.component';
import { PipelineSectionComponent } from './components/pipeline-section.component';
import { StorageSectionComponent } from './components/storage-section.component';

type SettingsPane = 'general' | 'llm' | 'diagnostics';

interface NavItem {
  section: SettingsPane;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { section: 'general', icon: 'sliders', label: 'settings.page.nav.general' },
  { section: 'llm', icon: 'sparkles', label: 'settings.page.nav.llm' },
  { section: 'diagnostics', icon: 'shield', label: 'settings.page.nav.diagnostics' },
];

const SECTION_ALIASES: Record<string, SettingsPane> = {
  storage: 'general',
  pipeline: 'general',
  about: 'diagnostics',
};

function toSection(id: string | null): SettingsPane {
  return NAV_ITEMS.find((item) => item.section === id)?.section ?? SECTION_ALIASES[id ?? ''] ?? 'general';
}

@Component({
  selector: 'ds-settings-page',
  imports: [
    AboutSectionComponent,
    AreaStateComponent,
    BannerComponent,
    DiagnosticsSectionComponent,
    GeneralSectionComponent,
    IconComponent,
    LlmProvidersSectionComponent,
    PageTitleDirective,
    PipelineSectionComponent,
    RouterLink,
    StorageSectionComponent,
    TranslatePipe,
  ],
  templateUrl: './settings.page.html',
  host: { class: 'ds-page settings-page' },
})
export class SettingsPage {
  private readonly store: SettingsStore = inject(SettingsStore);
  private readonly noticeDismissed = signal<boolean>(false);

  protected readonly navItems: NavItem[] = NAV_ITEMS;
  protected readonly ready: Signal<boolean> = computed(() => this.store.state() !== null);
  protected readonly section: Signal<SettingsPane> = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => toSection(params.get('id')))),
    { initialValue: 'general' },
  );
  protected readonly showResetNotice: Signal<boolean> = computed(() => {
    const state: SettingsState | null = this.store.state();
    return state !== null && state.notice !== 'none' && !this.noticeDismissed();
  });

  protected dismissNotice(): void {
    this.noticeDismissed.set(true);
  }
}
