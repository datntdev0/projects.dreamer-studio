import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../../../tests/support/desktop-fixture';
import { TopbarComponent } from './topbar.component';

describe('[TH01-03] TopbarComponent with real settings and theme services', () => {
  it('[L2-TH01-03-01] changes language/theme from actual buttons and reflects the saved choices', async () => {
    const app = desktopFixture();
    const view = await app.mount(TopbarComponent, false, [], { railExpanded: true });
    await view.click('topbar-lang');
    await view.click('topbar-theme');
    expect(app.api.updateSettings).toHaveBeenNthCalledWith(1, { language: 'vi' });
    expect(app.api.updateSettings).toHaveBeenNthCalledWith(2, { theme: 'dark' });
    expect(view.element('topbar-lang').textContent).toContain('VI');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    await view.click('topbar-lang');
    await view.click('topbar-theme');
    expect(view.element('topbar-lang').textContent).toContain('EN');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
