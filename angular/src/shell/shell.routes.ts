import type { Type } from '@angular/core';
import type { Route, Routes } from '@angular/router';
import { HOME_MODULE_ID, type AppModule } from './registry/modules';

function moduleRoutes(module: AppModule, comingSoon: Type<unknown>): Route[] {
  const path: string = module.id === HOME_MODULE_ID ? '' : module.id;
  const route: Route = { path, component: module.page ?? comingSoon, data: { module: module.id } };
  const subRoutes: Route[] = (module.subRoutes ?? []).map((subRoute) => ({
    path: `${path}/${subRoute.path}`,
    component: subRoute.page,
    data: { module: module.id, title: subRoute.title },
  }));
  const detailRoutes: Route[] = module.detailRoute
    ? [{ ...route, path: `${path}/:id`, component: module.detailPage ?? route.component }]
    : [];
  return [route, ...subRoutes, ...detailRoutes];
}

export function buildRoutes(modules: AppModule[], comingSoon: Type<unknown>): Routes {
  return [...modules.flatMap((module) => moduleRoutes(module, comingSoon)), { path: '**', redirectTo: '' }];
}
