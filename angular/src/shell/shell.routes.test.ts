import { describe, expect, it } from 'vitest';
import { LibraryPage } from '../features/library/library.page';
import { NovelPage } from '../features/library/novel.page';
import { ImportPage } from '../features/library/import/import.page';
import { MODULES } from './registry/modules';
import { buildRoutes } from './shell.routes';

class ComingSoonStub {}

describe('buildRoutes', () => {
  const routes = buildRoutes(MODULES, ComingSoonStub);

  it('maps Home to the empty path and others to their id', () => {
    expect(routes.map((route) => route.path)).toEqual([
      '',
      'library',
      'library/import',
      'library/:id',
      'analysis',
      'projects',
      'pipelines',
      'pipelines/:id',
      'settings',
      'settings/:id',
      '**',
    ]);
  });

  it('uses the coming soon component only for entries without a page', () => {
    expect(routes.find((route) => route.path === 'library')?.component).toBe(LibraryPage);
    expect(routes.find((route) => route.path === 'analysis')?.component).toBe(ComingSoonStub);
    expect(routes.find((route) => route.path === 'pipelines')?.component).not.toBe(ComingSoonStub);
  });

  it('renders a sub-route even when its module uses the coming soon page', () => {
    const route = routes.find((entry) => entry.path === 'library/import');
    expect(route?.component).toBe(ImportPage);
    expect(route?.data).toEqual({ module: 'library', title: 'library.import.page.title' });
  });

  it('resolves library imports before novel details and shows novel details with the reader page', () => {
    const importRoute = routes.find((entry) => entry.path === 'library/import');
    const detailRoute = routes.find((entry) => entry.path === 'library/:id');
    expect(importRoute?.component).toBe(ImportPage);
    expect(detailRoute?.component).toBe(NovelPage);
    expect(routes.indexOf(importRoute!)).toBeLessThan(routes.indexOf(detailRoute!));
  });

  it('adds a detail route only for modules that ask for it', () => {
    const detail = routes.find((route) => route.path === 'pipelines/:id');
    expect(detail?.data).toEqual({ module: 'pipelines' });
    expect(routes.some((route) => route.path === 'analysis/:id')).toBe(false);
  });

  it('puts the module id in route data', () => {
    const route = routes.find((entry) => entry.path === 'settings');
    expect(route?.data).toEqual({ module: 'settings' });
  });

  it('redirects unknown paths to Home', () => {
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
  });
});
