import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../../../tests/support/desktop-fixture';
import { LibraryPage } from '../../features/library/library.page';
import { TopbarComponent } from '../topbar/topbar.component';
import { LayoutService } from './layout.service';

describe('[TH01-03] LayoutService through production panels and lifecycle', () => {
  it('registers real panel directives, toggles their DOM through the topbar and only unregisters the current owner', async () => {
    const app = desktopFixture();
    const view = await app.mount(LibraryPage, true);
    await view.add(TopbarComponent, { railExpanded: true });
    const layout = TestBed.inject(LayoutService);
    const oldLeft = layout.visible('left');
    expect(oldLeft).not.toBeNull();
    expect(view.find('library-left')).not.toBeNull();
    expect(view.find('library-page-inspector')).not.toBeNull();
    await view.click('topbar-panel-left');
    expect(view.find('library-left')).toBeNull();
    expect(view.find('library-page-inspector')).not.toBeNull();
    await view.click('topbar-panel-left');
    expect(view.find('library-left')).not.toBeNull();
    const replacement = await view.add(LibraryPage);
    const newLeft = layout.visible('left');
    expect(newLeft).not.toBe(oldLeft);
    view.fixture.destroy();
    view.views.splice(view.views.indexOf(view.fixture), 1);
    await view.settle();
    expect(layout.visible('left')).toBe(newLeft);
    expect(view.find('library-left')).not.toBeNull();
    replacement.destroy();
    view.views.splice(view.views.indexOf(replacement), 1);
    await view.settle();
    expect(layout.has('left')).toBe(false);
    expect(layout.has('right')).toBe(false);
    expect(view.find('library-left')).toBeNull();
    expect(view.find('library-page-inspector')).toBeNull();
  });
});
