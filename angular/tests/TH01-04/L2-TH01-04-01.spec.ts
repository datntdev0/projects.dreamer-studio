import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { desktopFixture } from '../support/desktop-fixture';
import { HomePage } from '../../src/features/home/home.page';
import { StatusBarComponent } from '../../src/shell/status-bar/status-bar.component';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';

const running: PipelineRun = {
  id: 'run',
  type: 'demo',
  status: 'running',
  cancelReason: null,
  progress: 50,
  stepIndex: 1,
  stepCount: 1,
  stepName: 'work',
  stepDetail: null,
  errorCode: null,
  error: null,
  label: 'Test run',
  novelId: null,
  createdAt: '2026-01-01T00:00:00Z',
  startedAt: '2026-01-01T00:00:00Z',
  finishedAt: null,
};

describe('[TH01-04] L2-TH01-04-01 homepage, shell activity and notification components', () => {
  it.each(['succeeded', 'failed'] as const)(
    'AC6 renders %s and opens its run through the actual toast action',
    async (status) => {
      const app = desktopFixture();
      const view = await app.mount(HomePage);
      await view.add(StatusBarComponent);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      app.pipelineChanged.emit(running);
      await view.settle();
      expect(view.element('home-running-row').getAttribute('data-run-id')).toBe('run');
      expect(view.element('status-pipeline').textContent).toContain('50%');
      app.pipelineChanged.emit({ ...running, status, finishedAt: '2026-01-01T00:00:03Z' });
      await view.settle();
      expect(view.find('home-running-row')).toBeNull();
      expect(view.element('home-pipeline-row').getAttribute('data-status')).toBe(status);
      expect(view.element('toast').getAttribute('data-kind')).toBe(status === 'succeeded' ? 'success' : 'danger');
      await view.click('toast-action');
      expect(navigate).toHaveBeenCalledWith(['/pipelines', 'run']);
      expect(view.find('toast')).toBeNull();
      app.pipelineChanged.emit({ ...running, status });
      await view.settle();
      expect(view.find('toast')).toBeNull();
    },
  );

  it('AC5 removes deleted history from the actual recent-runs list', async () => {
    const app = desktopFixture();
    const view = await app.mount(HomePage);
    app.pipelineChanged.emit(running);
    app.pipelineChanged.emit({ ...running, status: 'succeeded' });
    await view.settle();
    expect(view.element('home-pipeline-row').getAttribute('data-run-id')).toBe('run');
    app.pipelineDeleted.emit(['run']);
    await view.settle();
    expect(view.find('home-pipeline-row')).toBeNull();
    expect(view.element('home-recent-pipelines').querySelector('ds-area-state')).not.toBeNull();
  });
});
