import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../support/desktop-fixture';
import { TranslationPage } from '../../src/features/translation/translation.page';

describe('[TH04-05] L2-TH04-05-02 production glossary translation dialog', () => {
  it('AC1 plans and starts from the actual scope/batch/instruction controls', async () => {
    const app = desktopFixture();
    const view = await app.mount(TranslationPage, true);
    await view.click('translation-page-translate');
    const dialog = view.element('translate-dialog-glossary');
    await view.click('translate-dialog-scope-all', dialog);
    await view.click('translate-dialog-batch-100', dialog);
    await view.click('instruction-toggle', dialog);
    await view.input('instruction-text', 'Shared instruction', 'input', dialog);
    await view.click('translate-dialog-start', dialog);
    const request = {
      novelId: 'novel',
      language: 'vi',
      scope: 'all',
      batchSize: 100,
      instruction: 'Shared instruction',
    };
    expect(app.api.translationPlanGlossary).toHaveBeenLastCalledWith(request);
    expect(app.api.translationStartGlossary).toHaveBeenCalledWith(request);
    expect(dialog.querySelector('dialog')?.open).toBe(false);
  });

  it('retains the real dialog configuration and renders the failure reason after a refused start', async () => {
    const app = desktopFixture();
    const view = await app.mount(TranslationPage, true);
    app.api.translationStartGlossary.mockRejectedValueOnce(new Error('CLI unavailable'));
    await view.click('translation-page-translate');
    const dialog = view.element('translate-dialog-glossary');
    await view.click('translate-dialog-scope-all', dialog);
    await view.click('translate-dialog-start', dialog);
    expect(dialog.querySelector('dialog')?.open).toBe(true);
    expect(view.element('translate-dialog-reason', dialog).textContent).toContain('CLI unavailable');
    expect((view.element('translate-dialog-scope-all', dialog) as HTMLInputElement).checked).toBe(true);
    expect(app.api.translationStartGlossary).toHaveBeenCalledTimes(1);
  });
});
