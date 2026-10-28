import { NgTemplateOutlet } from '@angular/common';
import { Component, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { AppModule, GROUP_TITLES, HOME_MODULE_ID, MODULES, ModuleGroup } from '../registry/modules';

interface RailGroup {
  id: ModuleGroup;
  title: string;
  entries: AppModule[];
}

const toGroup = (id: ModuleGroup): RailGroup => ({
  id,
  title: GROUP_TITLES[id],
  entries: MODULES.filter((module) => module.group === id),
});

@Component({
  selector: 'nav[dsRail]',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './rail.component.html',
  host: {
    class: 'ds-app-rail',
    '[attr.aria-label]': "i18n.t('rail.label')",
    'data-testid': 'rail',
  },
})
export class RailComponent {
  protected readonly i18n: I18nService = inject(I18nService);
  readonly collapsed = input(false, { transform: booleanAttribute });

  protected readonly topGroups: RailGroup[] = (['library', 'context', 'production'] as const).map(toGroup);
  protected readonly bottomGroups: RailGroup[] = [toGroup('system')];
  protected readonly homeId: string = HOME_MODULE_ID;

  protected link(entry: AppModule): string {
    return entry.id === HOME_MODULE_ID ? '/' : `/${entry.id}`;
  }
}
