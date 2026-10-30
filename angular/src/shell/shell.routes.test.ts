import { describe, expect, it } from 'vitest';
import { MODULES } from './registry/modules';
import { buildRoutes } from './shell.routes';

class ComingSoonPage {}

describe('[TH01-03] shell routes', () => {
  it('routes released modules to their pages and leaves future modules available through Coming Soon', () => {
    const routes = buildRoutes(MODULES, ComingSoonPage);
    const home = routes.find((route) => route.path === '');
    const released = routes.find((route) => route.path === 'settings');
    const future = routes.find((route) => route.path === 'projects');

    expect(home?.data?.['module']).toBe('home');
    expect(released?.component).toBe(MODULES.find((module) => module.id === 'settings')?.page);
    expect(future?.component).toBe(ComingSoonPage);
    expect(future?.data?.['module']).toBe('projects');
  });
});
