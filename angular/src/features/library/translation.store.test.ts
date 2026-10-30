import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DesktopApi } from '@core/desktop-api';
import { I18nService } from '@core/i18n/i18n.service';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { TranslationLanguageStore } from '@core/stores/translation-language-store';
import { describe, expect, it, vi } from 'vitest';
import { TranslationStore } from './translation.store';
import type { GlossaryKey } from '@dreamer/shared/models/translation';

describe('[TH04-05] TranslationStore', () => {
  it('clears chapter and glossary state when opening a different novel', async () => {
    TestBed.configureTestingModule({ providers: [
      TranslationStore,
      { provide: DesktopApi, useValue: {} },
      { provide: I18nService, useValue: { t: (key: string) => key } },
      { provide: CurrentNovelStore, useValue: { novel: () => null } },
      { provide: TranslationLanguageStore, useValue: { language: () => null, set: vi.fn() } },
    ] });
    const store = TestBed.inject(TranslationStore);
    store.chapter.set({} as never);
    store.glossary.set({} as never);

    await store.open('novel-a');

    expect(store.novelId()).toBe('novel-a');
    expect(store.chapter()).toBeNull();
    expect(store.glossary()).toBeNull();
    expect(store.view()).toBe('reader');
  });

  it('tracks a saved target-language choice and loads its glossary', async () => {
    const selected = signal<'en' | 'vi' | null>(null);
    const api = {
      translationStatus: vi.fn(async () => ({ targets: ['vi', 'en'] })),
      translationInstruction: vi.fn(async ({ language }: { language: 'en' | 'vi' }) => ({
        novelId: 'novel-a', language, text: '', isDefault: true, updatedAt: null,
      })),
      translationGlossary: vi.fn(async ({ language }: { language: 'en' | 'vi' }) => ({
        novelId: 'novel-a', language, analysed: true, rows: [],
      })),
      translationEditGlossary: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({ providers: [
      TranslationStore,
      { provide: DesktopApi, useValue: api },
      { provide: I18nService, useValue: { t: (key: string) => key } },
      { provide: CurrentNovelStore, useValue: { novel: () => null } },
      { provide: TranslationLanguageStore, useValue: {
        language: () => selected(), set: (_novelId: string, language: 'en' | 'vi') => selected.set(language),
      } },
    ] });
    const store = TestBed.inject(TranslationStore);
    await store.open('novel-a');
    store.setLanguage('en');
    await store.loadGlossary();

    expect(store.language()).toBe('en');
    expect(store.instruction()?.language).toBe('en');
    expect(store.glossary()?.language).toBe('en');
    expect(api.translationGlossary).toHaveBeenCalledWith({ novelId: 'novel-a', language: 'en' });
    const key: GlossaryKey = { entityType: 'Persona', entityName: 'Mai', term: null, kind: 'name' };
    expect(await store.editGlossary(key, 'Mây')).toBe(true);
    expect(api.translationEditGlossary).toHaveBeenCalledWith({ novelId: 'novel-a', language: 'en', key, translation: 'Mây' });
  });
});
