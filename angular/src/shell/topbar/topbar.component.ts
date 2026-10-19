import { Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { filter, map, startWith } from 'rxjs';
import { AppInfoStore } from '../../core/app-info';
import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme/theme.service';
import { GROUP_TITLES, MODULES } from '../registry/modules';
import type { AppModule } from '../registry/modules';

@Component({
  selector: 'header[dsTopbar]',
  imports: [ButtonDirective, IconComponent, TooltipDirective, RouterLink],
  templateUrl: './topbar.component.html',
  host: { class: 'ds-app-top', 'data-testid': 'topbar' },
})
export class TopbarComponent {
  readonly railExpanded = input.required<boolean>();
  readonly toggleRail = output<void>();

  private readonly router: Router = inject(Router);
  protected readonly theme: ThemeService = inject(ThemeService);
  protected readonly i18n: I18nService = inject(I18nService);
  protected readonly appInfo: AppInfoStore = inject(AppInfoStore);
  protected readonly groupTitles = GROUP_TITLES;

  private readonly moduleId = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.currentModuleId()),
    ),
    { initialValue: null },
  );

  protected readonly currentModule = computed<AppModule | undefined>(() =>
    MODULES.find((module) => module.id === this.moduleId()),
  );

  private currentModuleId(): string | null {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return (route.data['module'] as string | undefined) ?? null;
  }
}
