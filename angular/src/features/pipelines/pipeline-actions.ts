import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmService } from '@components/dialog/confirm.service';
import { ToastService } from '@components/toast/toast.service';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { I18nService } from '../../core/i18n/i18n.service';
import { PipelineStore } from '../../core/pipeline-store';
import { runName } from './run-status';

@Injectable({ providedIn: 'root' })
export class PipelineActions {
  private readonly router: Router = inject(Router);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly store: PipelineStore = inject(PipelineStore);

  open(id: string): void {
    void this.router.navigate(['/pipelines', id]);
  }

  async cancel(run: PipelineRun): Promise<void> {
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('pipelines.cancelConfirm.title', { name: runName(run, this.i18n) }),
      message: this.i18n.t(
        run.status === 'queued' ? 'pipelines.cancelConfirm.messageQueued' : 'pipelines.cancelConfirm.messageRunning',
      ),
      confirmLabel: this.i18n.t('pipelines.action.cancelRun'),
      cancelLabel: this.i18n.t('pipelines.cancelConfirm.keep'),
      danger: true,
    });
    if (confirmed) await this.store.cancel(run.id);
  }

  async delete(ids: string[]): Promise<boolean> {
    const count: number = ids.length;
    const many: boolean = count > 1;
    const confirmed: boolean = await this.confirm.confirm({
      title: many
        ? this.i18n.t('pipelines.deleteConfirm.titleMany', { count })
        : this.i18n.t('pipelines.deleteConfirm.titleOne'),
      message: this.i18n.t(many ? 'pipelines.deleteConfirm.messageMany' : 'pipelines.deleteConfirm.messageOne'),
      confirmLabel: this.i18n.t('pipelines.action.delete'),
      cancelLabel: this.i18n.t('common.cancel'),
      danger: true,
    });
    if (!confirmed) return false;
    const deleted: string[] = await this.store.delete(ids);
    this.toast.show({
      kind: 'success',
      title: many ? this.i18n.t('toast.runsDeleted', { count }) : this.i18n.t('toast.runDeleted'),
    });
    const openId: string | undefined = this.router.url.match(/^\/pipelines\/([^/?#]+)/)?.[1];
    if (openId && deleted.includes(decodeURIComponent(openId))) void this.router.navigate(['/pipelines']);
    return true;
  }

  copy(text: string, titleKey: string): void {
    void navigator.clipboard?.writeText(text);
    this.toast.show({ kind: 'success', title: this.i18n.t(titleKey) });
  }
}
