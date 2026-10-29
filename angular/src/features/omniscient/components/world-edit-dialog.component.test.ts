import { TestBed } from '@angular/core/testing';
import { I18nService } from '@core/i18n/i18n.service';
import { describe, expect, it, vi } from 'vitest';
import type { WorldEditEntity } from '@dreamer/shared/models/analysis';
import { WorldEditDialogComponent } from './world-edit-dialog.component';

describe('[TH04-01] WorldEditDialogComponent', () => {
  it('[L2-TH04-01-02] enables merge only after selecting two world entities', async () => {
    HTMLDialogElement.prototype.showModal ??= vi.fn();
    HTMLDialogElement.prototype.close ??= vi.fn();
    await TestBed.configureTestingModule({
      imports: [WorldEditDialogComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => key, language: () => 'en' } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(WorldEditDialogComponent);
    const entities: WorldEditEntity[] = [
      { id: 'e1', type: 'Character', name: 'Mai', aliases: [], titles: [], chapters: [1] },
      { id: 'e2', type: 'Character', name: 'Lan', aliases: [], titles: [], chapters: [2] },
    ];
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('scope', { issue: null, entities, facts: [], catalog: [], focus: [] });
    fixture.detectChanges();

    const merge = (): HTMLButtonElement => fixture.nativeElement.querySelector('[data-testid="world-edit-merge"]');
    expect(fixture.nativeElement.querySelector('[data-testid="world-edit-merge"]')).toBeNull();
    fixture.nativeElement.querySelector('[data-testid="world-edit-select-e1"] input').click();
    fixture.detectChanges();
    expect(merge().disabled).toBe(true);
    fixture.nativeElement.querySelector('[data-testid="world-edit-select-e2"] input').click();
    fixture.detectChanges();
    expect(merge().disabled).toBe(false);
  });
});
