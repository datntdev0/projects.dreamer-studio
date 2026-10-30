import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { desktopFixture } from '../support/desktop-fixture';
import { PipelineSectionComponent } from '../../src/features/settings/components/pipeline-section.component';

describe('[TH02-01] L2-TH02-01-01 production pipeline settings controls', () => {
  it('AC1 commits a chosen concurrency and restores the last saved value with visible feedback after refusal', async () => {
    const app = desktopFixture();
    const view = await app.mount(PipelineSectionComponent);
    await view.input('settings-pipeline-max', '3');
    await view.input('settings-pipeline-max', '3', 'change');
    expect(app.api.updateSettings).toHaveBeenCalledWith({ pipelines: { maxConcurrent: 3 } });
    expect(view.element('settings-pipeline-max-value').textContent).toBe('3');
    app.api.updateSettings.mockRejectedValueOnce({
      code: ErrorCode.SettingsInvalid,
      message: 'Invalid concurrency',
      details: 'pipelines.maxConcurrent',
    });
    await view.input('settings-pipeline-max', '4');
    await view.input('settings-pipeline-max', '4', 'change');
    expect(view.element('settings-pipeline-max-value').textContent).toBe('3');
    expect((view.element('settings-pipeline-max') as HTMLInputElement).value).toBe('3');
    expect(view.element('toast').getAttribute('role')).toBe('alert');
  });

  it('AC1 refreshes existing controls when changed settings arrive from the desktop', async () => {
    const app = desktopFixture();
    const view = await app.mount(PipelineSectionComponent);
    app.settingsChanged.emit({ ...app.state.settings, pipelines: { maxConcurrent: 4, maxChapters: 2 } });
    await view.settle();
    expect((view.element('settings-pipeline-max') as HTMLInputElement).value).toBe('4');
    expect(view.element('settings-pipeline-max-value').textContent).toBe('4');
    expect((view.element('settings-pipeline-chapters') as HTMLInputElement).value).toBe('2');
    expect(app.api.onSettingsChanged).toHaveBeenCalledTimes(1);
  });
});
