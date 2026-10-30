import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

describe('[TH01-03] ThemeService', () => {
  it('reflects theme changes on the document root without restarting', () => {
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('light');

    theme.setTheme('dark');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('dark');

    theme.setTheme('light');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
