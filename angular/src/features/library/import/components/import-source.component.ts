import { Component, computed, inject, type Signal } from '@angular/core';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ProgressComponent } from '@components/status/progress.component';
import { ToastService } from '@components/toast/toast.service';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { PACKAGE_LIMITS } from '@dreamer/shared/models/novel-package';
import type { PackageLimit, PackageProblem, PackageProblemCode } from '@dreamer/shared/models/novel-package';
import type { PackageReadResult, PackageRefusal } from '@dreamer/shared/models/novel-package';
import { formatBytes, formatCount } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { ImportStore } from '../import.store';

interface ProblemRow extends PackageProblem {
  key: string;
}

interface RefusalKeys {
  title: string;
  message: string;
}

const REFUSAL_KEYS: Record<PackageRefusal, RefusalKeys> = {
  notZip: {
    title: 'library.import.source.refused.notZip.title',
    message: 'library.import.source.refused.notZip.message',
  },
  unsafePath: {
    title: 'library.import.source.refused.unsafePath.title',
    message: 'library.import.source.refused.unsafePath.message',
  },
  unsupportedType: {
    title: 'library.import.source.refused.unsupportedType.title',
    message: 'library.import.source.refused.unsupportedType.message',
  },
  tooLarge: {
    title: 'library.import.source.refused.tooLarge.title',
    message: 'library.import.source.refused.tooLarge.zip',
  },
  problems: {
    title: 'library.import.source.refused.problems.titleMany',
    message: 'library.import.source.refused.problems.message',
  },
};

const TOO_LARGE_KEYS: Record<PackageLimit, string> = {
  zip: 'library.import.source.refused.tooLarge.zip',
  unpacked: 'library.import.source.refused.tooLarge.unpacked',
  entries: 'library.import.source.refused.tooLarge.entries',
  chapter: 'library.import.source.refused.tooLarge.chapter',
  cover: 'library.import.source.refused.tooLarge.cover',
};

const PROBLEM_KEYS: Record<PackageProblemCode, string> = {
  metadataMissing: 'library.import.source.problem.metadataMissing',
  metadataInvalid: 'library.import.source.problem.metadataInvalid',
  versionUnsupported: 'library.import.source.problem.versionUnsupported',
  fieldMissing: 'library.import.source.problem.fieldMissing',
  fieldInvalid: 'library.import.source.problem.fieldInvalid',
  languageInvalid: 'library.import.source.problem.languageInvalid',
  chapterListedTwice: 'library.import.source.problem.chapterListedTwice',
  chapterFileMissing: 'library.import.source.problem.chapterFileMissing',
  notUtf8: 'library.import.source.problem.notUtf8',
  coverInvalid: 'library.import.source.problem.coverInvalid',
};

function packageLimit(value: string | number | undefined): PackageLimit {
  if (value === 'unpacked' || value === 'entries' || value === 'chapter' || value === 'cover') return value;
  return 'zip';
}

@Component({
  selector: 'ds-import-source',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, ProgressComponent, TranslatePipe],
  templateUrl: './import-source.component.html',
  host: {
    class: 'import-source',
    'data-testid': 'import-source',
    '[class.drag-over]': 'store.dragOver()',
    '[attr.data-stage]': 'store.stage()',
    '[attr.aria-busy]': "store.stage() === 'reading' ? true : null",
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class ImportSourceComponent {
  protected readonly store: ImportStore = inject(ImportStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);

  protected readonly refusal: Signal<PackageRefusal | null> = computed(() => {
    const result: PackageReadResult | null = this.store.result();
    return result?.status === 'refused' ? result.refusal : null;
  });
  protected readonly fileSize: Signal<string> = computed(() =>
    formatBytes(this.store.file()?.size ?? 0, this.i18n.language()),
  );
  protected readonly problems: Signal<ProblemRow[]> = computed(() => {
    const result: PackageReadResult | null = this.store.result();
    if (result?.status !== 'refused') return [];
    return result.problems.map((problem: PackageProblem): ProblemRow => ({
      ...problem,
      key: PROBLEM_KEYS[problem.code],
    }));
  });
  protected readonly refusalTitleKey: Signal<string> = computed(() => {
    const refusal: PackageRefusal = this.refusal() ?? 'notZip';
    if (refusal === 'problems' && this.problems().length === 1)
      return 'library.import.source.refused.problems.titleOne';
    return REFUSAL_KEYS[refusal].title;
  });
  protected readonly refusalMessageKey: Signal<string> = computed(() => {
    const refusal: PackageRefusal = this.refusal() ?? 'notZip';
    if (refusal !== 'tooLarge') return REFUSAL_KEYS[refusal].message;
    const result: PackageReadResult | null = this.store.result();
    return TOO_LARGE_KEYS[packageLimit(result?.status === 'refused' ? result.params['limit'] : undefined)];
  });
  protected readonly params: Signal<TranslateParams> = computed(() => {
    const result: PackageReadResult | null = this.store.result();
    const source: TranslateParams = result?.status === 'refused' ? result.params : {};
    const limit: PackageLimit = packageLimit(source['limit']);
    const size: number = typeof source['size'] === 'number' ? source['size'] : (this.store.file()?.size ?? 0);
    const max: number = typeof source['max'] === 'number' ? source['max'] : PACKAGE_LIMITS.zipBytes;
    return {
      ...source,
      file: source['file'] ?? this.store.file()?.name ?? '',
      size: limit === 'entries' ? formatCount(size, this.i18n.language()) : formatBytes(size, this.i18n.language()),
      max: limit === 'entries' ? formatCount(max, this.i18n.language()) : formatBytes(max, this.i18n.language()),
      count: this.problems().length,
    };
  });
  protected readonly unsafeEntry: Signal<string> = computed(() => {
    const result: PackageReadResult | null = this.store.result();
    if (result?.status !== 'refused') return '';
    return String(result.params['entry'] ?? '');
  });

  protected pick(): void {
    void this.store.pickPackage();
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    const reading: boolean = this.store.stage() === 'reading';
    if (event.dataTransfer) event.dataTransfer.dropEffect = reading ? 'none' : 'copy';
    this.store.setDragOver(!reading, (event.dataTransfer?.items.length ?? 0) > 1);
  }

  protected onDragLeave(event: DragEvent): void {
    const section: Node = event.currentTarget as Node;
    if (!section.contains(event.relatedTarget as Node | null)) this.store.setDragOver(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.store.stage() === 'reading') return;
    void this.store.drop(Array.from(event.dataTransfer?.files ?? []));
  }

  protected async copyProblems(): Promise<void> {
    const lines: string[] = this.problems().map(
      (problem: ProblemRow): string => `- ${this.i18n.t(problem.key, problem.params)} (${problem.where})`,
    );
    try {
      await navigator.clipboard.writeText([this.store.file()?.name ?? '', ...lines].join('\n'));
      this.toast.show({ kind: 'success', title: this.i18n.t('library.import.source.copied') });
    } catch {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('library.import.source.copyFailed'),
        message: this.i18n.t('about.copyFailedHint'),
      });
    }
  }
}
