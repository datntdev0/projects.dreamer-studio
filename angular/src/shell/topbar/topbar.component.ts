import { Component, computed, effect, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import type { SplitterEdge } from '@components/splitter/splitter.directive';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { filter, map, startWith } from 'rxjs';
import { AppInfoStore } from '../../core/app-info';
import { I18nService } from '../../core/i18n/i18n.service';
import { SettingsStore } from '../../core/stores/settings-store';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeService } from '../../core/theme/theme.service';
import { LayoutService } from '../layout/layout.service';
import { PageCrumbService } from '../page-crumb.service';
import { GROUP_TITLES, MODULES } from '../registry/modules';
import type { AppModule } from '../registry/modules';

interface ShellRouteData {
  moduleId: string | null;
  title: string | null;
}

@Component({
  selector: 'header[dsTopbar]',
  imports: [ButtonDirective, IconComponent, TooltipDirective, RouterLink, TranslatePipe],
  templateUrl: './topbar.component.html',
  host: { class: 'ds-app-top', 'data-testid': 'topbar' },
})
export class TopbarComponent {
  readonly railExpanded = input.required<boolean>();
  readonly toggleRail = output<void>();

  private readonly router: Router = inject(Router);
  private readonly settings: SettingsStore = inject(SettingsStore);
  private readonly theme: ThemeService = inject(ThemeService);
  protected readonly i18n: I18nService = inject(I18nService);
  protected readonly appInfo: AppInfoStore = inject(AppInfoStore);
  protected readonly layout: LayoutService = inject(LayoutService);
  protected readonly crumb: PageCrumbService = inject(PageCrumbService);
  protected readonly panelEdges: SplitterEdge[] = ['left', 'right', 'bottom'];
  protected readonly groupTitles = GROUP_TITLES;

  private readonly title: Title = inject(Title);
  private readonly routeData = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.currentRouteData()),
    ),
    { initialValue: { moduleId: null, title: null } },
  );

  protected readonly currentModule = computed<AppModule | undefined>(() =>
    MODULES.find((module) => module.id === this.routeData().moduleId),
  );
  protected readonly currentPageKey = computed<string | undefined>(() => {
    const title: string | null = this.routeData().title;
    if (title) return title;
    return this.currentModule()?.id === 'library' ? 'library.browse.novels' : this.currentModule()?.label;
  });

  constructor() {
    effect(() => {
      const module = this.currentModule();
      if (module) {
        this.title.setTitle(
          this.i18n.t('app.windowTitle', { page: this.i18n.t(this.currentPageKey() ?? module.label) }),
        );
      }
    });
  }

  protected toggleLanguage(): void {
    void this.settings.update({ language: this.i18n.language() === 'en' ? 'vi' : 'en' });
  }

  protected toggleTheme(): void {
    void this.settings.update({ theme: this.theme.theme() === 'light' ? 'dark' : 'light' });
  }

  private currentRouteData(): ShellRouteData {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return {
      moduleId: (route.data['module'] as string | undefined) ?? null,
      title: (route.data['title'] as string | undefined) ?? null,
    };
  }
}
