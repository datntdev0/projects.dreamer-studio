import type { Type } from '@angular/core';
import type { Routes } from '@angular/router';
import { HOME_MODULE_ID, type AppModule } from './registry/modules';

export function buildRoutes(modules: AppModule[], comingSoon: Type<unknown>): Routes {
  return [
    ...modules.map((module) => ({
      path: module.id === HOME_MODULE_ID ? '' : module.id,
      component: module.page ?? comingSoon,
      data: { module: module.id },
    })),
    { path: '**', redirectTo: '' },
  ];
}
