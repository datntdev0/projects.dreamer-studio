import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

@Component({ template: '' })
class ThemeHost {
  readonly theme = inject(ThemeService);
}

describe('[TH01-03] ThemeService', () => {
  it('reflects theme changes on the document root without restarting', async () => {
    await TestBed.configureTestingModule({ imports: [ThemeHost] }).compileComponents();
    const fixture = TestBed.createComponent(ThemeHost);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe('light');

    fixture.componentInstance.theme.setTheme('dark');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe('dark');

    fixture.componentInstance.theme.setTheme('light');
    fixture.detectChanges();
    await fixture.whenStable();
  });
});
