import type { Type } from '@angular/core';
import { HomePage } from '../../features/home/home.page';

export type ModuleGroup = 'library' | 'analysis' | 'production' | 'system';

export interface AppModule {
  id: string;
  group: ModuleGroup;
  icon: string;
  label: string;
  description: string;
  release: string | null;
  page: Type<unknown> | null;
}

export const HOME_MODULE_ID = 'home';

export const GROUP_TITLES: Record<ModuleGroup, string> = {
  library: 'Library',
  analysis: 'Analysis',
  production: 'Production',
  system: 'System',
};

export const MODULES: AppModule[] = [
  {
    id: HOME_MODULE_ID,
    group: 'library',
    icon: 'home',
    label: 'Home',
    description: 'Start here: recent work and pipeline activity.',
    release: null,
    page: HomePage,
  },
  {
    id: 'library',
    group: 'library',
    icon: 'library',
    label: 'Library',
    description: 'Browse and organize your source media.',
    release: '0.1.0',
    page: null,
  },
  {
    id: 'analysis',
    group: 'analysis',
    icon: 'network',
    label: 'Analysis',
    description: 'Analyze media with AI to extract insights.',
    release: '0.2.0',
    page: null,
  },
  {
    id: 'projects',
    group: 'production',
    icon: 'box',
    label: 'Projects',
    description: 'Produce creative content in projects.',
    release: null,
    page: null,
  },
  {
    id: 'pipelines',
    group: 'system',
    icon: 'tasks',
    label: 'Pipelines',
    description: 'Monitor and manage pipeline runs.',
    release: '0.0.0',
    page: null,
  },
  {
    id: 'settings',
    group: 'system',
    icon: 'settings',
    label: 'Settings',
    description: 'Configure the studio.',
    release: '0.0.0',
    page: null,
  },
];
