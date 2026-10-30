import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorHandler } from '@core/error-handler';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { RootComponent } from '../../src/root.component';
import { desktopFixture } from '../support/desktop-fixture';

describe('[TH01-01] L2-TH01-01-01 application error banners', () => {
  it('AC3 logs the exception and renders the actual root banner with open-log/dismiss actions', async () => {
    const app = desktopFixture();
    const view = await app.mount(RootComponent, false, [AppErrorHandler]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.inject(AppErrorHandler).handleError(new Error('Renderer crashed'));
    await view.settle();
    expect(app.api.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        module: 'angular',
        message: 'Renderer crashed',
        stack: expect.stringContaining('Renderer crashed'),
      }),
    );
    expect(view.element('error-banner').querySelector('[role="alert"]')).not.toBeNull();
    expect(view.element('error-banner').textContent).toContain(ErrorCode.UiUnexpected);
    await view.click('banner-open-logs', view.element('error-banner'));
    expect(app.api.openLogs).toHaveBeenCalledTimes(1);
    await view.click('banner-dismiss', view.element('error-banner'));
    expect(view.find('error-banner')).toBeNull();
  });

  it('AC3 renders one banner with the preserved application code and repeat count', async () => {
    const app = desktopFixture();
    const view = await app.mount(RootComponent, false, [AppErrorHandler]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = TestBed.inject(AppErrorHandler);
    const rejection = { code: ErrorCode.ChapterFileMissing, message: 'Source file missing' };
    handler.handleError({ rejection });
    handler.handleError({ rejection });
    await view.settle();
    expect(app.api.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ message: `${rejection.code}: ${rejection.message}` }),
    );
    expect(view.fixture.nativeElement.querySelectorAll('[data-testid="error-banner"]')).toHaveLength(1);
    expect(view.element('banner-meta', view.element('error-banner')).textContent).toContain(
      `${ErrorCode.ChapterFileMissing} (×2)`,
    );
  });
});
