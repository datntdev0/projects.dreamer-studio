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
      'settings',
      '**',
    ]);
  });

  it('uses the coming soon component only for entries without a page', () => {
    expect(routes.find((route) => route.path === 'library')?.component).toBe(LibraryPageStub);
    expect(routes.find((route) => route.path === 'analysis')?.component).toBe(ComingSoonStub);
  });

  it('puts the module id and title in route data', () => {
    const route = routes.find((entry) => entry.path === 'settings');
    expect(route?.data).toEqual({ module: 'settings' });
    expect(route?.title).toBe('Settings – Dreamer Studio');
  });

  it('redirects unknown paths to Home', () => {
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
  });
});
