import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../support/desktop-fixture';
import { GeneralSectionComponent } from '../../src/features/settings/components/general-section.component';
import { TopbarComponent } from '../../src/shell/topbar/topbar.component';
import { RailComponent } from '../../src/shell/rail/rail.component';
import { I18N_DICTIONARIES } from '@core/i18n/i18n.service';

describe('[TH01-03] L2-TH01-03-01 live shell components', () => {
  it('AC3 applies settings controls to the existing topbar, document language and document theme', async () => {
    const app = desktopFixture();
    const view = await app.mount(GeneralSectionComponent);
    await view.add(TopbarComponent, { railExpanded: true });
    await view.click('segmented-vi', view.element('settings-general-language'));
    await view.click('segmented-dark', view.element('settings-general-theme'));
    expect(view.element('topbar-lang').textContent).toContain('VI');
    expect(document.documentElement.lang).toBe('vi');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(view.element('segmented-dark', view.element('settings-general-theme')).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(app.api.updateSettings).toHaveBeenCalledWith({ language: 'vi' });
    expect(app.api.updateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    app.settingsChanged.emit({ ...app.state.settings, language: 'en', theme: 'light' });
    await view.settle();
    expect(view.element('topbar-lang').textContent).toContain('EN');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('renders English dictionary fallback in the real rail and logs each missing key only once', async () => {
    const app = desktopFixture();
    app.state.settings.language = 'vi';
    const view = await app.mount(RailComponent, false, [
      { provide: I18N_DICTIONARIES, useValue: { en: { 'nav.library': 'Library' }, vi: {} } },
    ]);
    expect(view.element('rail-entry-library').textContent).toContain('Library');
    await view.settle();
    await view.settle();
    expect(
      app.api.writeLog.mock.calls.filter(([entry]) => entry.message.includes('Missing translation: nav.library ')),
    ).toHaveLength(1);
    expect(view.element('rail-entry-library').getAttribute('href')).toBe('/library');
    expect(view.element('rail-entry-projects').getAttribute('href')).toBe('/projects');
  });
});
