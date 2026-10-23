import type { Type } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import type { Route, Routes } from '@angular/router';
import { HOME_MODULE_ID, type AppModule } from './registry/modules';

interface CanLeaveComponent {
  canLeave?: () => boolean | Promise<boolean>;
}

const canLeave: CanDeactivateFn<CanLeaveComponent> = (component: CanLeaveComponent): boolean | Promise<boolean> =>
  component.canLeave?.() ?? true;

function moduleRoutes(module: AppModule, comingSoon: Type<unknown>): Route[] {
  const path: string = module.id === HOME_MODULE_ID ? '' : module.id;
  const route: Route = {
    path,
    component: module.page ?? comingSoon,
    data: { module: module.id },
    canDeactivate: [canLeave],
  };
  const subRoutes: Route[] = (module.subRoutes ?? []).map((subRoute) => ({
    path: `${path}/${subRoute.path}`,
    component: subRoute.page,
    data: { module: module.id, title: subRoute.title },
    canDeactivate: [canLeave],
  }));
  const detailRoutes: Route[] = module.detailRoute
    ? [{ ...route, path: `${path}/:id`, component: module.detailPage ?? route.component }]
    : [];
  return [route, ...subRoutes, ...detailRoutes];
}

export function buildRoutes(modules: AppModule[], comingSoon: Type<unknown>): Routes {
  return [...modules.flatMap((module) => moduleRoutes(module, comingSoon)), { path: '**', redirectTo: '' }];
}
