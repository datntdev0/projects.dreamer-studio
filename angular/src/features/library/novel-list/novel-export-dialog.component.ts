import { booleanAttribute, Component, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import type { ToastAction } from '@components/toast/toast.service';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { packageFileName, withExtension } from '../library-format';
import type { LibraryNovel } from '../library.models';
import { LibraryMockStore } from '../library.store';
import { NovelDialogSummaryComponent } from './novel-dialog-summary.component';

const EXPORT_FOLDER = 'C:\\Users\\me\\Documents';

@Component({
  selector: 'ds-novel-export-dialog',
  imports: [
    ButtonDirective,
    CheckboxComponent,
    DialogComponent,
    FieldComponent,
    IconComponent,
    NovelDialogSummaryComponent,
    TranslatePipe,
  ],
  templateUrl: './novel-export-dialog.component.html',
})
export class NovelExportDialogComponent {
  readonly open = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly novel = input.required<LibraryNovel | null>();
  readonly closed = output<void>();

  protected readonly folder = signal<string>(EXPORT_FOLDER);
  protected readonly fileName = signal<string>('');
  protected readonly simulateFailure = signal<boolean>(false);
  protected readonly touched = signal<boolean>(false);

  private readonly store: LibraryMockStore = inject(LibraryMockStore);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly router: Router = inject(Router);

  constructor() {
    effect(() => {
      const novel: LibraryNovel | null = this.novel();
      if (this.open() && novel) {
        this.fileName.set(packageFileName(novel));
        this.simulateFailure.set(false);
        this.touched.set(false);
      }
    });
  }

  protected dismiss(): void {
    if (this.open()) this.closed.emit();
  }

  protected save(event: Event): void {
    event.preventDefault();
    this.touched.set(true);
    const novel: LibraryNovel | null = this.novel();
    const folder: string = this.folder().trim();
    const fileName: string = this.fileName().trim();
    if (!novel || !folder || !fileName) return;
    const path: string = `${folder.replace(/[\\/]+$/, '')}\\${withExtension(fileName)}`;
    const fails: boolean = this.simulateFailure();
    const startedId: number = this.toast.show({
      kind: 'info',
      title: this.i18n.t('library.novelDialog.export.started', { title: novel.title }),
      message: this.i18n.t('library.novelDialog.export.started.message'),
      action: this.pipelinesAction(),
    });
    this.store.startExport(novel.id, () => {
      this.toast.dismiss(startedId);
      this.toast.show(
        fails
          ? {
              kind: 'danger',
              title: this.i18n.t('library.novelDialog.export.failed', { title: novel.title }),
              message: this.i18n.t('library.novelDialog.export.failed.message'),
              action: this.pipelinesAction(),
            }
          : {
              kind: 'success',
              title: this.i18n.t('library.novelDialog.export.done', { title: novel.title }),
              message: path,
              action: { label: this.i18n.t('library.novelDialog.export.showInFolder'), run: () => undefined },
            },
      );
    });
    this.closed.emit();
  }

  private pipelinesAction(): ToastAction {
    return {
      label: this.i18n.t('library.novelDialog.viewPipelines'),
      run: () => void this.router.navigateByUrl('/pipelines'),
    };
  }
}
