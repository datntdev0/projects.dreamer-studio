import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { I18nService } from '@core/i18n/i18n.service';
import { describe, expect, it, vi } from 'vitest';
import { OmniscientStore } from '../omniscient.store';
import { ReviewViewComponent } from './review-view.component';

describe('[TH04-01] ReviewViewComponent', () => {
  it('[L2-TH04-01-02] forwards kind and chapter selection changes to the review store', async () => {
    const store = {
      review: signal(null), reviewKind: signal('all'), reviewChapter: signal(null),
      reviewChapters: signal([{ index: 2, title: 'Two' }]),
      run: signal(null), novel: signal(null), locked: signal(false), busy: signal(false),
      setReviewFilter: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [ReviewViewComponent],
      providers: [
        { provide: OmniscientStore, useValue: store },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReviewViewComponent);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('[data-testid="world-review-kind"]') as HTMLSelectElement;
    select.value = 'entity';
    select.dispatchEvent(new Event('change'));
    expect(store.setReviewFilter).toHaveBeenCalledWith({ kind: 'entity' });
    const chapter = fixture.nativeElement.querySelector('[data-testid="world-review-chapter"]') as HTMLSelectElement;
    chapter.value = '2';
    chapter.dispatchEvent(new Event('change'));
    expect(store.setReviewFilter).toHaveBeenCalledWith({ chapter: 2 });
  });
});
