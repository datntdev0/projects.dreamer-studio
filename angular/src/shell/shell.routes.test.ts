import { describe, expect, it } from 'vitest';
import { MODULES } from './registry/modules';
import { buildRoutes } from './shell.routes';

class ComingSoonStub {}
class LibraryPageStub {}

describe('buildRoutes', () => {
  const modules = MODULES.map((module) => (module.id === 'library' ? { ...module, page: LibraryPageStub } : module));
  const routes = buildRoutes(modules, ComingSoonStub);

  it('maps Home to the empty path and others to their id', () => {
    expect(routes.map((route) => route.path)).toEqual([
      '',
      'library',
      'analysis',
      'projects',
      'pipelines',
      'pipelines/:id',
      'settings',
      '**',
    ]);
  });

  it('uses the coming soon component only for entries without a page', () => {
    expect(routes.find((route) => route.path === 'library')?.component).toBe(LibraryPageStub);
    expect(routes.find((route) => route.path === 'analysis')?.component).toBe(ComingSoonStub);
  });

  it('adds a detail route only for modules that ask for it', () => {
    const detail = routes.find((route) => route.path === 'pipelines/:id');
    expect(detail?.data).toEqual({ module: 'pipelines' });
    expect(routes.some((route) => route.path === 'settings/:id')).toBe(false);
  });

  it('puts the module id in route data', () => {
    const route = routes.find((entry) => entry.path === 'settings');
    expect(route?.data).toEqual({ module: 'settings' });
  });

  it('redirects unknown paths to Home', () => {
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
  });
});
