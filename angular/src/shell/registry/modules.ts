import type { Type } from '@angular/core';
import { HomePage } from '../../features/home/home.page';
import { PipelinesPage } from '../../features/pipelines/pipelines.page';
import { SettingsPage } from '../../features/settings/settings.page';

export type ModuleGroup = 'library' | 'analysis' | 'production' | 'system';

export interface AppModule {
  id: string;
  group: ModuleGroup;
  icon: string;
  label: string;
  description: string;
  release: string | null;
  page: Type<unknown> | null;
  detailRoute?: boolean;
}

export const HOME_MODULE_ID = 'home';

export const GROUP_TITLES: Record<ModuleGroup, string> = {
  library: 'rail.group.library',
  analysis: 'rail.group.analysis',
  production: 'rail.group.production',
  system: 'rail.group.system',
};

export const MODULES: AppModule[] = [
  {
    id: HOME_MODULE_ID,
    group: 'library',
    icon: 'home',
    label: 'nav.home',
    description: 'module.home.desc',
    release: null,
    page: HomePage,
  },
  {
    id: 'library',
    group: 'library',
    icon: 'library',
    label: 'nav.library',
    description: 'module.library.desc',
    release: '0.1.0',
    page: null,
  },
  {
    id: 'analysis',
    group: 'analysis',
    icon: 'network',
    label: 'nav.analysis',
    description: 'module.analysis.desc',
    release: '0.2.0',
    page: null,
  },
  {
    id: 'projects',
    group: 'production',
    icon: 'box',
    label: 'nav.projects',
    description: 'module.projects.desc',
    release: null,
    page: null,
  },
  {
    id: 'pipelines',
    group: 'system',
    icon: 'tasks',
    label: 'nav.pipelines',
    description: 'module.pipelines.desc',
    release: '0.0.0',
    page: PipelinesPage,
    detailRoute: true,
  },
  {
    id: 'settings',
    group: 'system',
    icon: 'settings',
    label: 'nav.settings',
    description: 'module.settings.desc',
    release: '0.0.0',
    page: SettingsPage,
    detailRoute: true,
  },
];
