import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18nService } from '@core/i18n/i18n.service';
import { describe, expect, it } from 'vitest';
import { RailComponent } from './rail.component';

describe('[TH01-03] RailComponent', () => {
  it('keeps released and future modules discoverable at their module routes', async () => {
    await TestBed.configureTestingModule({
      imports: [RailComponent],
      providers: [
        provideRouter([]),
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RailComponent);
    fixture.detectChanges();

    const library = fixture.nativeElement.querySelector('[data-testid="rail-entry-library"]') as HTMLAnchorElement;
    const future = fixture.nativeElement.querySelector('[data-testid="rail-entry-projects"]') as HTMLAnchorElement;
    expect(library.getAttribute('href')).toBe('/library');
    expect(future.getAttribute('href')).toBe('/projects');
    expect(fixture.nativeElement.querySelector('[data-testid="rail-group-system"]')).not.toBeNull();
  });
});
