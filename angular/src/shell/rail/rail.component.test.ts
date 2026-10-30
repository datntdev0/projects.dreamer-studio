import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../../../tests/support/desktop-fixture';
import { RailComponent } from './rail.component';

describe('[TH01-03] RailComponent production navigation', () => {
  it('keeps released and future destinations discoverable with real links and translated labels', async () => {
    const app = desktopFixture();
    const view = await app.mount(RailComponent);
    expect(view.element('rail-entry-library').getAttribute('href')).toBe('/library');
    expect(view.element('rail-entry-library').textContent).toContain('Library');
    expect(view.element('rail-entry-projects').getAttribute('href')).toBe('/projects');
    expect(view.find('rail-group-system')).not.toBeNull();
  });
});
