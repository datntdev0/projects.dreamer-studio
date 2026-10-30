import { describe, expect, it, vi } from 'vitest';
import { desktopFixture } from '../support/desktop-fixture';
import { TranslationPage } from '../../src/features/translation/translation.page';

describe('[TH04-05] L2-TH04-05-01 production glossary and instruction editor', () => {
  it('AC1 saves/resets instruction from the real editor and restores each target language', async () => {
    const app = desktopFixture();
    const view = await app.mount(TranslationPage, true);
    await view.input('instruction-text', 'User instruction');
    await view.click('instruction-save');
    expect(app.api.translationSaveInstruction).toHaveBeenCalledWith({
      novelId: 'novel',
      language: 'vi',
      text: 'User instruction',
    });
    await view.input('translation-language', 'en', 'change');
    expect((view.element('instruction-text') as HTMLTextAreaElement).value).toBe('Default instruction');
    await view.input('translation-language', 'vi', 'change');
    expect((view.element('instruction-text') as HTMLTextAreaElement).value).toBe('User instruction');
    await view.click('instruction-reset');
    await view.click('dialog-confirm');
    expect((view.element('instruction-text') as HTMLTextAreaElement).value).toBe('Default instruction');
    expect((view.element('instruction-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('AC2 commits and clears translations using the real virtual glossary row', async () => {
    const app = desktopFixture();
    const key = { entityType: 'Persona' as const, entityName: 'Mai', term: null, kind: 'name' as const };
    app.state.glossary = [{ ...key, translation: null, status: 'untranslated', chapters: 1, chapterIndexes: [1] }];
    const view = await app.mount(TranslationPage, true);
    await vi.waitFor(() =>
      expect(view.fixture.nativeElement.querySelector('[data-testid^="glossary-input-"]')).not.toBeNull(),
    );
    const input = view.fixture.nativeElement.querySelector('[data-testid^="glossary-input-"]') as HTMLInputElement;
    input.value = 'Translated Mai';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await view.settle();
    expect(app.api.translationEditGlossary).toHaveBeenCalledWith({
      novelId: 'novel',
      language: 'vi',
      key: expect.objectContaining(key),
      translation: 'Translated Mai',
    });
    expect(
      (view.fixture.nativeElement.querySelector('[data-testid^="glossary-input-"]') as HTMLInputElement).value,
    ).toBe('Translated Mai');
    (view.fixture.nativeElement.querySelector('[data-testid^="glossary-clear-"]') as HTMLButtonElement).click();
    await view.settle();
    expect(app.api.translationEditGlossary).toHaveBeenLastCalledWith(
      expect.objectContaining({ language: 'vi', translation: null }),
    );
    expect(
      (view.fixture.nativeElement.querySelector('[data-testid^="glossary-input-"]') as HTMLInputElement).value,
    ).toBe('');
  });

  it('AC4 shows the no-analysis explanation and a real link to analysis', async () => {
    const app = desktopFixture();
    app.state.analysed = false;
    const view = await app.mount(TranslationPage, true);
    expect(view.find('glossary-not-analysed')).not.toBeNull();
    expect(view.element('glossary-open-omniscient').getAttribute('href')).toBe('/omniscient');
  });
});
