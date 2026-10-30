import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppInfoStore } from '@core/app-info';
import { I18nService } from '@core/i18n/i18n.service';
import { SettingsStore } from '@core/stores/settings-store';
import { ThemeService } from '@core/theme/theme.service';
import { describe, expect, it, vi } from 'vitest';
import { LayoutService } from '../layout/layout.service';
import { PageCrumbService } from '../page-crumb.service';
import { TopbarComponent } from './topbar.component';

describe('[TH01-03] TopbarComponent', () => {
  it('[L2-TH01-03-01] sends language and theme choices to the settings store', async () => {
    const update = vi.fn(async () => true);
    await TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsStore, useValue: { update } },
        { provide: ThemeService, useValue: { theme: signal<'light' | 'dark'>('light') } },
        { provide: I18nService, useValue: { t: (key: string) => key, language: signal<'en' | 'vi'>('en') } },
        { provide: AppInfoStore, useValue: { info: signal(null) } },
        { provide: LayoutService, useValue: { has: () => false, isOpen: () => true, toggle: vi.fn() } },
        { provide: PageCrumbService, useValue: { detail: signal(null) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TopbarComponent);
    fixture.componentRef.setInput('railExpanded', true);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="topbar-lang"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="topbar-theme"]') as HTMLButtonElement).click();
    expect(update).toHaveBeenNthCalledWith(1, { language: 'vi' });
    expect(update).toHaveBeenNthCalledWith(2, { theme: 'dark' });
  });
});
