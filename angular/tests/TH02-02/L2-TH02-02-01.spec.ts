import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppInfoStore } from '@core/app-info';
import { BackendStatus } from '@core/backend-status';
import { DesktopApi } from '@core/desktop-api';
import { I18nService } from '@core/i18n/i18n.service';
import { ToastService } from '@components/toast/toast.service';
import { AboutSectionComponent } from '../../src/features/settings/components/about-section.component';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import { MISSING } from '@dreamer/shared/models/about';

describe('[TH02-02] L2-TH02-02-01 About identity and bug report actions', () => {
  let fixture: ComponentFixture<AboutSectionComponent>;
  const info = signal<AppInfo | null>(null);
  const copy = vi.fn<(text: string) => Promise<void>>();
  const openLink = vi.fn<DesktopApi['openLink']>();
  const show = vi.fn<ToastService['show']>();
  let clipboardDescriptor: PropertyDescriptor | undefined;
  beforeEach(async () => {
    copy.mockReset();
    copy.mockResolvedValue(undefined);
    openLink.mockReset();
    show.mockReset();
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    info.set({
      version: '0.2.0',
      buildDate: '2026-10-31',
      author: 'Author',
      appDataDir: 'data',
      settingsDir: 'settings',
      electron: '42',
      chrome: '148',
      node: '26',
      os: 'Windows',
      schemaVersion: '0.2.0_1',
    });
    await TestBed.configureTestingModule({
      imports: [AboutSectionComponent],
      providers: [
        { provide: AppInfoStore, useValue: { info, state: signal('ready') } },
        { provide: BackendStatus, useValue: { state: signal('running'), address: signal('http://localhost:1234') } },
        { provide: DesktopApi, useValue: { openLink } },
        { provide: ToastService, useValue: { show } },
        { provide: I18nService, useValue: { t: (key: string) => (key === 'app.name' ? 'Dreamer Studio' : key) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutSectionComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });
  const element = (id: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  it('AC1 copies the displayed release/runtime identity for a bug report and opens the repository through the API', async () => {
    expect(element('about-name').textContent).toBe('Dreamer Studio');
    expect(element('about-version').textContent).toContain('0.2.0');
    expect(element('about-build-date').textContent).toContain('2026-10-31');
    expect(element('about-license').textContent).toContain('MIT');
    element('about-repository').click();
    expect(openLink).toHaveBeenCalledWith('repository');
    element('about-copy').click();
    await fixture.whenStable();
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('Dreamer Studio 0.2.0\nBuild date: 2026-10-31'));
    expect(copy.mock.calls[0][0]).toContain('Database schema: 0.2.0_1');
    expect(copy.mock.calls[0][0]).toContain('http://localhost:1234');
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('AC1 reports a clipboard failure without presenting a successful copy', async () => {
    copy.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    element('about-copy').click();
    await fixture.whenStable();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'danger', title: 'about.copyFailed', message: 'about.copyFailedHint' }),
    );
  });

  it('handles missing release metadata and still copies a usable bug report', async () => {
    info.set(null);
    fixture.detectChanges();
    expect(element('about-version').textContent).toContain(MISSING);
    element('about-copy').click();
    await fixture.whenStable();
    expect(copy).toHaveBeenCalledWith(expect.stringContaining(`Dreamer Studio ${MISSING}`));
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });
});
