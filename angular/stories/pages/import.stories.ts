import { Component, computed, inject, input, output, signal, DestroyRef, model, OnInit } from '@angular/core';
import { ElementRef, effect, viewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ProgressComponent } from '@components/status/progress.component';
import { ToastService } from '@components/toast/toast.service';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { formatBytes } from '../../src/core/format';
import { I18nService } from '../../src/core/i18n/i18n.service';
import { TranslatePipe } from '../../src/core/i18n/translate.pipe';
import { FieldComponent } from '@components/form/field.component';
import { SplitterDirective } from '@components/splitter/splitter.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { PillComponent } from '@components/status/pill.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { Routes } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { DialogComponent } from '@components/dialog/dialog.component';
import { ComingSoonPage } from '../../src/shell/coming-soon/coming-soon.page';
import { PageTitleDirective } from '../../src/shell/page-title.directive';
import { MODULES } from '../../src/shell/registry/modules';
import { ShellComponent } from '../../src/shell/shell.component';
import { buildRoutes } from '../../src/shell/shell.routes';
import { provideDesktopApi } from '../fixtures/desktop-api';

type ImportStage = 'source' | 'reading' | 'refused' | 'preview';

type ImportRefusal = 'notZip' | 'unsafePath' | 'unsupportedType' | 'tooLarge' | 'problems';

type ImportProblemCode =
  | 'metadataMissing'
  | 'metadataInvalid'
  | 'versionUnsupported'
  | 'chapterFileMissing'
  | 'chapterListedTwice'
  | 'notUtf8'
  | 'titleMissing'
  | 'languageInvalid';

interface ImportProblem {
  code: ImportProblemCode;
  params: Record<string, string | number>;
  where: string;
}

type ChapterCheck = 'empty' | 'sameText';

interface ImportChapter {
  index: number;
  file: string;
  title: string;
  chars: number;
  checks: ChapterCheck[];
  sameAs: number | null;
  included: boolean;
}

interface ImportCover {
  name: string;
  size: number;
}

interface ImportMetadata {
  originalTitle: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  language: string;
  cover: ImportCover | null;
}

interface ImportFile {
  name: string;
  size: number;
}

interface ImportPreview {
  file: ImportFile;
  formatVersion: number;
  metadata: ImportMetadata;
  chapters: ImportChapter[];
  ignoredFiles: string[];
}

interface ImportSample {
  id: string;
  file: ImportFile;
  refusal: ImportRefusal | null;
  problems: ImportProblem[];
  unsafeEntry: string | null;
  packageType: string | null;
  preview: ImportPreview | null;
}

const LANGUAGE_OPTIONS: string[] = ['zh', 'ja', 'ko', 'en', 'vi'];

const MB: number = 1024 * 1024;

function chapterFile(index: number): string {
  return `chapters/${String(index).padStart(4, '0')}.txt`;
}

function buildChapters(count: number): ImportChapter[] {
  return Array.from({ length: count }, (_, i: number): ImportChapter => {
    const index: number = i + 1;
    return {
      index,
      file: chapterFile(index),
      title: `第${index}章`,
      chars: 2900 + ((index * 137) % 700),
      checks: [],
      sameAs: null,
      included: true,
    };
  });
}

function withChecks(chapters: ImportChapter[]): ImportChapter[] {
  return chapters.map((chapter: ImportChapter): ImportChapter => {
    if (chapter.index === 12) return { ...chapter, chars: 0, checks: ['empty'] };
    if (chapter.index === 8) return { ...chapter, chars: 3118, checks: ['sameText'], sameAs: 7 };
    if (chapter.index === 7) return { ...chapter, chars: 3118 };
    return chapter;
  });
}

const QING_YU_NIAN: ImportPreview = {
  file: { name: '庆余年.zip', size: 5.4 * MB },
  formatVersion: 1,
  metadata: {
    originalTitle: '庆余年',
    title: 'Khánh Dư Niên',
    author: '猫腻',
    description: '范闲身世成谜，自澹州入京都，卷入庆国朝堂与江湖的风云。',
    tags: ['历史', '权谋'],
    language: 'zh',
    cover: { name: 'cover.jpg', size: 1.2 * MB },
  },
  chapters: withChecks(buildChapters(748)),
  ignoredFiles: ['notes/readme.md'],
};

const FAN_REN: ImportPreview = {
  file: { name: '凡人修仙传.zip', size: 18.2 * MB },
  formatVersion: 1,
  metadata: {
    originalTitle: '凡人修仙传',
    title: '',
    author: '忘语',
    description: '',
    tags: [],
    language: 'zh',
    cover: null,
  },
  chapters: buildChapters(2446),
  ignoredFiles: [],
};

const IMPORT_SAMPLES: ImportSample[] = [
  {
    id: 'ok',
    file: QING_YU_NIAN.file,
    refusal: null,
    problems: [],
    unsafeEntry: null,
    packageType: 'novel',
    preview: QING_YU_NIAN,
  },
  {
    id: 'minimal',
    file: FAN_REN.file,
    refusal: null,
    problems: [],
    unsafeEntry: null,
    packageType: 'novel',
    preview: FAN_REN,
  },
  {
    id: 'noChapters',
    file: { name: '空白之书.zip', size: 0.01 * MB },
    refusal: null,
    problems: [],
    unsafeEntry: null,
    packageType: 'novel',
    preview: {
      file: { name: '空白之书.zip', size: 0.01 * MB },
      formatVersion: 1,
      metadata: {
        originalTitle: '空白之书',
        title: 'Sách trống',
        author: '',
        description: '',
        tags: [],
        language: 'zh',
        cover: null,
      },
      chapters: [],
      ignoredFiles: [],
    },
  },
  {
    id: 'notZip',
    file: { name: '庆余年.txt', size: 5.3 * MB },
    refusal: 'notZip',
    problems: [],
    unsafeEntry: null,
    packageType: null,
    preview: null,
  },
  {
    id: 'unsafePath',
    file: { name: 'evil-pack.zip', size: 3.2 * MB },
    refusal: 'unsafePath',
    problems: [],
    unsafeEntry: '../evil.txt',
    packageType: null,
    preview: null,
  },
  {
    id: 'unsupportedType',
    file: { name: 'qingshi-xiang.zip', size: 9.1 * MB },
    refusal: 'unsupportedType',
    problems: [],
    unsafeEntry: null,
    packageType: 'music',
    preview: null,
  },
  {
    id: 'tooLarge',
    file: { name: 'huge-novel.zip', size: 260 * MB },
    refusal: 'tooLarge',
    problems: [],
    unsafeEntry: null,
    packageType: null,
    preview: null,
  },
  {
    id: 'problems',
    file: { name: '庆余年-broken.zip', size: 5.4 * MB },
    refusal: 'problems',
    problems: [
      {
        code: 'chapterFileMissing',
        params: { index: 12, file: chapterFile(12) },
        where: 'metadata.json · chapters[11]',
      },
      {
        code: 'chapterListedTwice',
        params: { file: chapterFile(5) },
        where: 'metadata.json · chapters[4], chapters[5]',
      },
      { code: 'notUtf8', params: { file: chapterFile(10) }, where: chapterFile(10) },
      { code: 'titleMissing', params: {}, where: 'metadata.json · title' },
      { code: 'languageInvalid', params: { value: 'chinese' }, where: 'metadata.json · language' },
    ],
    unsafeEntry: null,
    packageType: 'novel',
    preview: null,
  },
];

interface ProblemRow extends ImportProblem {
  key: string;
}

const MAX_PACKAGE_BYTES: number = 200 * 1024 * 1024;

const REFUSAL_KEYS: Record<ImportRefusal, { title: string; message: string }> = {
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
    message: 'library.import.source.refused.tooLarge.message',
  },
  problems: {
    title: 'library.import.source.refused.problems.titleMany',
    message: 'library.import.source.refused.problems.message',
  },
};

const PROBLEM_KEYS: Record<ImportProblemCode, string> = {
  metadataMissing: 'library.import.source.problem.metadataMissing',
  metadataInvalid: 'library.import.source.problem.metadataInvalid',
  versionUnsupported: 'library.import.source.problem.versionUnsupported',
  chapterFileMissing: 'library.import.source.problem.chapterFileMissing',
  chapterListedTwice: 'library.import.source.problem.chapterListedTwice',
  notUtf8: 'library.import.source.problem.notUtf8',
  titleMissing: 'library.import.source.problem.titleMissing',
  languageInvalid: 'library.import.source.problem.languageInvalid',
};

@Component({
  selector: 'ds-import-source-preview',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, ProgressComponent, TranslatePipe],
  template: `
    @switch (stage()) {
      @case ('reading') {
        <div class="import-source-reading" role="status" data-testid="import-source-reading">
          <ds-icon class="import-source-icon" name="file-zip" size="xl" />
          <h2 class="import-source-title">{{ 'library.import.source.reading' | t: { file: file()?.name ?? '' } }}</h2>
          <ds-progress [value]="null" />
          <p class="import-source-note">{{ 'library.import.source.readingNote' | t }}</p>
        </div>
      }
      @case ('refused') {
        <ds-area-state
          kind="error"
          [heading]="refusalTitleKey() | t: params()"
          [description]="refusalMessageKey() | t: params()"
          [attr.data-refusal]="refusal()"
          data-testid="import-source-refused"
        >
          @if (file(); as current) {
            <span class="import-source-file" data-testid="import-source-file">
              <ds-icon [name]="refusal() === 'notZip' ? 'file' : 'file-zip'" size="sm" />
              <span class="name">{{ current.name }}</span>
              <span class="num">{{ fileSize() }}</span>
            </span>
          }
          @if (refusal() === 'unsafePath') {
            <code class="import-source-entry" data-testid="import-source-entry">{{ sample()?.unsafeEntry }}</code>
          }
          @if (refusal() === 'problems') {
            <ol class="import-source-problems" data-testid="import-source-problems">
              @for (problem of problems(); track $index) {
                <li [attr.data-testid]="'import-source-problem-' + problem.code">
                  <ds-icon class="import-source-problem-icon" name="alert-circle" size="sm" />
                  <span class="message">{{ problem.key | t: problem.params }}</span>
                  <span class="where">{{ problem.where }}</span>
                </li>
              }
            </ol>
          }
          <div class="import-source-actions">
            @if (refusal() === 'problems') {
              <button dsBtn variant="ghost" type="button" data-testid="import-source-copy" (click)="copyProblems()">
                <ds-icon name="copy" size="sm" />{{ 'library.import.source.copy' | t }}
              </button>
            }
            <button dsBtn variant="primary" type="button" data-testid="import-source-pick" (click)="pick.emit()">
              <ds-icon name="folder" size="sm" />{{ 'library.import.page.changeFile' | t }}
            </button>
          </div>
        </ds-area-state>
      }
      @default {
        <div class="import-source-idle" data-testid="import-source-idle">
          <span class="import-source-mark"><ds-icon [name]="dragOver() ? 'download' : 'upload'" size="lg" /></span>
          <h2 class="import-source-title" data-testid="import-source-drop-title">
            {{ (dragOver() ? 'library.import.source.release' : 'library.import.source.drop') | t }}
          </h2>
          <span class="import-source-or">{{ 'library.import.source.or' | t }}</span>
          <button dsBtn variant="primary" type="button" data-testid="import-source-pick" (click)="pick.emit()">
            <ds-icon name="folder" size="sm" />{{ 'library.import.source.choose' | t }}
          </button>
          <ul
            class="import-source-format"
            [attr.aria-label]="'library.import.source.formatLabel' | t"
            data-testid="import-source-format"
          >
            <li>
              <code>metadata.json</code><span>{{ 'library.import.source.formatMetadata' | t }}</span>
            </li>
            <li>
              <code>chapters/*.txt</code><span>{{ 'library.import.source.formatChapters' | t }}</span>
            </li>
            <li>
              <code>cover.jpg</code><span>{{ 'library.import.source.formatCover' | t }}</span>
            </li>
          </ul>
          <p class="import-source-note">{{ 'library.import.source.safeNote' | t }}</p>
        </div>
      }
    }
  `,
  host: {
    class: 'import-source',
    'data-testid': 'import-source',
    '[class.drag-over]': 'dragOver()',
    '[attr.data-stage]': 'stage()',
    '[attr.aria-busy]': "stage() === 'reading' ? true : null",
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
class ImportSourcePreview {
  readonly stage = input.required<ImportStage>();
  readonly file = input<ImportFile | null>(null);
  readonly sample = input<ImportSample | null>(null);
  readonly pick = output<void>();
  readonly dropFiles = output<ImportFile[]>();

  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);

  protected readonly dragOver = signal<boolean>(false);
  protected readonly refusal: Signal<ImportRefusal | null> = computed(() => this.sample()?.refusal ?? null);
  protected readonly fileSize: Signal<string> = computed(() => this.formatSize(this.file()?.size ?? 0));
  protected readonly problems: Signal<ProblemRow[]> = computed(() =>
    (this.sample()?.problems ?? []).map((problem: ImportProblem): ProblemRow => ({
      ...problem,
      key: PROBLEM_KEYS[problem.code],
    })),
  );
  protected readonly refusalTitleKey: Signal<string> = computed(() => {
    const refusal: ImportRefusal = this.refusal() ?? 'notZip';
    if (refusal === 'problems' && this.problems().length === 1)
      return 'library.import.source.refused.problems.titleOne';
    return REFUSAL_KEYS[refusal].title;
  });
  protected readonly refusalMessageKey: Signal<string> = computed(
    () => REFUSAL_KEYS[this.refusal() ?? 'notZip'].message,
  );
  protected readonly params: Signal<TranslateParams> = computed(() => ({
    file: this.file()?.name ?? '',
    size: this.fileSize(),
    max: this.formatSize(MAX_PACKAGE_BYTES),
    type: this.sample()?.packageType ?? '',
    count: this.problems().length,
  }));

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    const reading: boolean = this.stage() === 'reading';
    if (event.dataTransfer) event.dataTransfer.dropEffect = reading ? 'none' : 'copy';
    this.dragOver.set(!reading);
  }

  protected onDragLeave(event: DragEvent): void {
    const section: Node = event.currentTarget as Node;
    if (!section.contains(event.relatedTarget as Node | null)) this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (this.stage() === 'reading') return;
    const files: ImportFile[] = Array.from(event.dataTransfer?.files ?? []).map((file: File): ImportFile => ({
      name: file.name,
      size: file.size,
    }));
    if (files.length > 0) this.dropFiles.emit(files);
  }

  protected async copyProblems(): Promise<void> {
    const lines: string[] = this.problems().map(
      (problem: ProblemRow): string => `- ${this.i18n.t(problem.key, problem.params)} (${problem.where})`,
    );
    try {
      await navigator.clipboard.writeText([this.file()?.name ?? '', ...lines].join('\n'));
      this.toast.show({ kind: 'success', title: this.i18n.t('library.import.source.copied') });
    } catch {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('library.import.source.copyFailed'),
        message: this.i18n.t('about.copyFailedHint'),
      });
    }
  }

  private formatSize(bytes: number): string {
    return formatBytes(bytes, this.i18n.language());
  }
}

type RequiredField = 'originalTitle' | 'title' | 'language';
type TextField = RequiredField | 'author' | 'description';
type CoverSource = 'package' | 'chosen';

interface LanguageOption {
  code: string;
  label: string;
}

const REQUIRED_FIELDS: RequiredField[] = ['originalTitle', 'title', 'language'];
const COVER_TYPES: string[] = ['image/jpeg', 'image/png'];
const VERTICAL_LANGUAGES: string[] = ['zh', 'ja'];

@Component({
  selector: 'ds-import-metadata-preview',
  imports: [ButtonDirective, FieldComponent, IconComponent, TranslatePipe],
  template: `
    <div class="ds-panel-head">
      <h2>{{ 'library.import.metadata.heading' | t }}</h2>
    </div>
    <section class="ds-panel-body import-metadata" data-testid="import-metadata">
      <p class="import-metadata-note" data-testid="import-metadata-note">
        <ds-icon name="info" size="sm" />{{ 'library.import.metadata.note' | t }}
      </p>
      <div class="import-metadata-fields">
        <ds-field
          [label]="'library.import.metadata.originalTitle' | t"
          controlId="import-metadata-original-title"
          [hint]="'library.import.metadata.originalTitleHint' | t"
          [error]="errors().originalTitle ? ('library.import.metadata.required' | t) : ''"
          required
        >
          <input
            id="import-metadata-original-title"
            class="ds-input"
            required
            [value]="metadata().originalTitle"
            [attr.aria-invalid]="errors().originalTitle || null"
            data-testid="import-metadata-original-title"
            (input)="setText('originalTitle', $event)"
            (blur)="touch('originalTitle')"
          />
        </ds-field>
        <ds-field
          [label]="'library.import.metadata.title' | t"
          controlId="import-metadata-title"
          [hint]="'library.import.metadata.titleHint' | t"
          [error]="errors().title ? ('library.import.metadata.required' | t) : ''"
          required
        >
          <input
            id="import-metadata-title"
            class="ds-input"
            required
            [value]="metadata().title"
            [attr.aria-invalid]="errors().title || null"
            data-testid="import-metadata-title"
            (input)="setText('title', $event)"
            (blur)="touch('title')"
          />
        </ds-field>
        <ds-field [label]="'library.import.metadata.author' | t" controlId="import-metadata-author">
          <input
            id="import-metadata-author"
            class="ds-input"
            [value]="metadata().author"
            data-testid="import-metadata-author"
            (input)="setText('author', $event)"
          />
        </ds-field>
        <ds-field
          [label]="'library.import.metadata.language' | t"
          controlId="import-metadata-language"
          [hint]="'library.import.metadata.languageHint' | t"
          [error]="errors().language ? ('library.import.metadata.required' | t) : ''"
          required
        >
          <span class="ds-select">
            <select
              id="import-metadata-language"
              class="ds-input"
              required
              [attr.aria-invalid]="errors().language || null"
              data-testid="import-metadata-language"
              (change)="setText('language', $event)"
              (blur)="touch('language')"
            >
              <option value="" [selected]="!metadata().language">
                {{ 'library.import.metadata.languagePlaceholder' | t }}
              </option>
              @for (option of languageOptions(); track option.code) {
                <option [value]="option.code" [selected]="option.code === metadata().language">
                  {{ option.label }}
                </option>
              }
            </select>
            <ds-icon name="chevron-down" size="sm" />
          </span>
        </ds-field>
        <ds-field
          [label]="'library.import.metadata.tags' | t"
          controlId="import-metadata-tags-input"
          [hint]="'library.import.metadata.tagsHint' | t"
        >
          <div class="import-metadata-tags" data-testid="import-metadata-tags" (click)="tagInput.focus()">
            @for (tag of metadata().tags; track tag) {
              <span class="import-metadata-tag" data-testid="import-metadata-tag">
                {{ tag }}
                <button
                  type="button"
                  [attr.aria-label]="'library.import.metadata.removeTag' | t: { tag }"
                  data-testid="import-metadata-tag-remove"
                  (click)="removeTag(tag); tagInput.focus()"
                >
                  <ds-icon name="x" size="sm" />
                </button>
              </span>
            }
            <input
              #tagInput
              id="import-metadata-tags-input"
              [value]="tagDraft()"
              [placeholder]="'library.import.metadata.tagsPlaceholder' | t"
              data-testid="import-metadata-tags-input"
              (input)="tagDraft.set(tagInput.value)"
              (keydown)="onTagKeydown($event)"
              (blur)="commitTags()"
            />
          </div>
        </ds-field>
        <ds-field [label]="'library.import.metadata.description' | t" controlId="import-metadata-description">
          <textarea
            id="import-metadata-description"
            class="ds-input"
            rows="4"
            [value]="metadata().description"
            data-testid="import-metadata-description"
            (input)="setText('description', $event)"
          ></textarea>
        </ds-field>
        <ds-field
          [label]="'library.import.metadata.cover' | t"
          [error]="coverInvalid() ? ('library.import.metadata.coverInvalid' | t) : ''"
        >
          <div class="import-metadata-cover" data-testid="import-metadata-cover">
            @if (metadata().cover; as cover) {
              <span class="import-metadata-cover-tile" data-testid="import-metadata-cover-image">
                @if (coverUrl(); as url) {
                  <img [src]="url" alt="" />
                } @else {
                  <ds-icon name="image" size="lg" />
                }
              </span>
              <div class="import-metadata-cover-body">
                <span class="import-metadata-cover-name" data-testid="import-metadata-cover-name">{{
                  cover.name
                }}</span>
                <span class="meta">{{ coverMetaKey() | t: { size: coverSize(cover) } }}</span>
                <div class="import-metadata-cover-actions">
                  <button
                    dsBtn
                    size="sm"
                    type="button"
                    data-testid="import-metadata-cover-choose"
                    (click)="coverInput.click()"
                  >
                    <ds-icon name="image" size="sm" />{{ 'library.import.metadata.coverChoose' | t }}
                  </button>
                  <button
                    dsBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    data-testid="import-metadata-cover-remove"
                    (click)="removeCover()"
                  >
                    <ds-icon name="trash" size="sm" />{{ 'library.import.metadata.coverRemove' | t }}
                  </button>
                </div>
              </div>
            } @else {
              <span
                class="import-metadata-cover-tile generated"
                [class.vertical]="verticalTitle()"
                aria-hidden="true"
                data-testid="import-metadata-cover-placeholder"
                ><span>{{ metadata().originalTitle || metadata().title }}</span></span
              >
              <div class="import-metadata-cover-body">
                <span class="meta">{{ 'library.import.metadata.coverNone' | t }}</span>
                <div class="import-metadata-cover-actions">
                  <button
                    dsBtn
                    size="sm"
                    type="button"
                    data-testid="import-metadata-cover-choose"
                    (click)="coverInput.click()"
                  >
                    <ds-icon name="image" size="sm" />{{ 'library.import.metadata.coverChoose' | t }}
                  </button>
                </div>
              </div>
            }
            <input
              #coverInput
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              hidden
              data-testid="import-metadata-cover-input"
              (change)="chooseCover(coverInput)"
            />
          </div>
        </ds-field>
      </div>
    </section>
  `,
})
class ImportMetadataPreview implements OnInit {
  readonly metadata = model.required<ImportMetadata>();

  protected readonly tagDraft = signal<string>('');
  protected readonly coverUrl = signal<string | null>(null);
  protected readonly coverSource = signal<CoverSource>('package');
  protected readonly coverInvalid = signal<boolean>(false);
  private readonly touched = signal<RequiredField[]>([]);

  private readonly i18n: I18nService = inject(I18nService);

  protected readonly errors: Signal<Record<RequiredField, boolean>> = computed(() => {
    const metadata: ImportMetadata = this.metadata();
    const touched: RequiredField[] = this.touched();
    const isMissing = (field: RequiredField): boolean => touched.includes(field) && !metadata[field].trim();
    return { originalTitle: isMissing('originalTitle'), title: isMissing('title'), language: isMissing('language') };
  });

  protected readonly languageOptions: Signal<LanguageOption[]> = computed(() => {
    const names = new Intl.DisplayNames([this.i18n.language()], { type: 'language' });
    const current: string = this.metadata().language;
    const codes: string[] =
      current && !LANGUAGE_OPTIONS.includes(current) ? [...LANGUAGE_OPTIONS, current] : LANGUAGE_OPTIONS;
    return codes.map((code: string): LanguageOption => ({ code, label: `${names.of(code) ?? code} · ${code}` }));
  });

  protected readonly verticalTitle: Signal<boolean> = computed(() =>
    VERTICAL_LANGUAGES.includes(this.metadata().language.split('-')[0]),
  );

  protected readonly coverMetaKey: Signal<string> = computed(() =>
    this.coverSource() === 'package'
      ? 'library.import.metadata.coverFromPackage'
      : 'library.import.metadata.coverChosen',
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releaseCoverUrl());
  }

  ngOnInit(): void {
    const metadata: ImportMetadata = this.metadata();
    this.touched.set(REQUIRED_FIELDS.filter((field: RequiredField): boolean => !metadata[field].trim()));
  }

  protected setText(field: TextField, event: Event): void {
    const value: string = (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    this.update({ [field]: value });
    if (field === 'language') this.touch('language');
  }

  protected touch(field: RequiredField): void {
    if (!this.touched().includes(field)) this.touched.update((fields: RequiredField[]) => [...fields, field]);
  }

  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitTags();
    } else if (event.key === 'Backspace' && !this.tagDraft()) {
      const tags: string[] = this.metadata().tags;
      if (tags.length) this.removeTag(tags[tags.length - 1]);
    }
  }

  protected commitTags(): void {
    const tags: string[] = [...this.metadata().tags];
    for (const part of this.tagDraft().split(',')) {
      const tag: string = part.trim();
      const exists: boolean = tags.some((item: string): boolean => item.toLowerCase() === tag.toLowerCase());
      if (tag && !exists) tags.push(tag);
    }
    this.tagDraft.set('');
    if (tags.length !== this.metadata().tags.length) this.update({ tags });
  }

  protected removeTag(tag: string): void {
    this.update({ tags: this.metadata().tags.filter((item: string): boolean => item !== tag) });
  }

  protected chooseCover(input: HTMLInputElement): void {
    const file: File | undefined = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.coverInvalid.set(!COVER_TYPES.includes(file.type));
    if (this.coverInvalid()) return;
    this.releaseCoverUrl();
    this.coverUrl.set(URL.createObjectURL(file));
    this.coverSource.set('chosen');
    this.update({ cover: { name: file.name, size: file.size } });
  }

  protected removeCover(): void {
    this.releaseCoverUrl();
    this.coverInvalid.set(false);
    this.update({ cover: null });
  }

  protected coverSize(cover: ImportCover): string {
    return formatBytes(cover.size, this.i18n.language());
  }

  private update(patch: Partial<ImportMetadata>): void {
    this.metadata.set({ ...this.metadata(), ...patch });
  }

  private releaseCoverUrl(): void {
    const url: string | null = this.coverUrl();
    if (url) URL.revokeObjectURL(url);
    this.coverUrl.set(null);
  }
}

const OVERSCAN_ROWS: number = 8;
const FIRST_PAINT_ROWS: number = 30;

const CHECK_KEYS: Record<ChapterCheck, string> = {
  empty: 'library.import.chapters.check.empty',
  sameText: 'library.import.chapters.check.sameText',
};

interface RowRange {
  start: number;
  end: number;
}

function hasWarnings(chapter: ImportChapter): boolean {
  return chapter.checks.length > 0;
}

@Component({
  selector: 'ds-import-chapters-preview',
  imports: [AreaStateComponent, CheckboxComponent, PillComponent, TooltipDirective, TranslatePipe],
  template: `
    <section class="import-chapters" data-testid="import-chapters">
      <header class="ds-panel-head">
        <h2>{{ 'library.import.chapters.heading' | t }}</h2>
        <span class="meta num" data-testid="import-chapters-summary">{{
          'library.import.chapters.summary'
            | t: { included: formatCount(includedCount()), total: formatCount(chapters().length) }
        }}</span>
        <span class="ds-spacer"></span>
        <ds-checkbox
          data-testid="import-chapters-only-warnings"
          [disabled]="!warningCount()"
          [checked]="onlyWarnings()"
          (checkedChange)="filter($event)"
          >{{ 'library.import.chapters.onlyWarnings' | t: { count: warningCount() } }}</ds-checkbox
        >
      </header>
      @if (chapters().length) {
        <div
          #viewport
          class="ds-panel-body import-chapters-viewport"
          data-testid="import-chapters-viewport"
          (scroll)="scrollTop.set(viewport.scrollTop)"
        >
          <table
            class="ds-table dense"
            data-testid="import-chapters-table"
            [attr.aria-label]="'library.import.chapters.tableLabel' | t"
            [attr.aria-rowcount]="shown().length + 1"
          >
            <colgroup>
              <col class="col-check" />
              <col class="col-index" />
              <col />
              <col class="col-file" />
              <col class="col-chars" />
              <col class="col-check-result" />
            </colgroup>
            <thead>
              <tr aria-rowindex="1">
                <th>
                  <ds-checkbox
                    data-testid="import-chapters-tick-all"
                    [disabled]="!shown().length"
                    [checked]="allShownIncluded()"
                    (checkedChange)="includeShown($event)"
                    ><span class="visually-hidden">{{ 'library.import.chapters.tickShown' | t }}</span></ds-checkbox
                  >
                </th>
                <th class="num">{{ 'library.import.chapters.col.index' | t }}</th>
                <th>{{ 'library.import.chapters.col.title' | t }}</th>
                <th>{{ 'library.import.chapters.col.file' | t }}</th>
                <th class="num">{{ 'library.import.chapters.col.chars' | t }}</th>
                <th>{{ 'library.import.chapters.col.check' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @if (padTop()) {
                <tr class="import-chapters-spacer" aria-hidden="true">
                  <td colspan="6" [style.height.px]="padTop()"></td>
                </tr>
              }
              @for (chapter of visibleRows(); track chapter.index; let i = $index) {
                <tr
                  data-testid="import-chapters-row"
                  [class.is-excluded]="!chapter.included"
                  [attr.aria-current]="chapter.index === revealed() || null"
                  [attr.aria-rowindex]="range().start + i + 2"
                  [attr.data-index]="chapter.index"
                  [attr.data-included]="chapter.included"
                  [attr.data-check]="chapter.checks.join(' ') || null"
                >
                  <td>
                    <ds-checkbox
                      data-testid="import-chapters-row-tick"
                      [checked]="chapter.included"
                      (checkedChange)="include(chapter.index, $event)"
                      ><span class="visually-hidden">{{
                        'library.import.chapters.tickRow' | t: { index: chapter.index }
                      }}</span></ds-checkbox
                    >
                  </td>
                  <td class="num meta">{{ chapter.index }}</td>
                  <td>
                    <input
                      class="ds-input import-chapters-title"
                      type="text"
                      data-testid="import-chapters-row-title"
                      [value]="chapter.title"
                      [placeholder]="'library.import.chapters.titlePlaceholder' | t: { index: chapter.index }"
                      [attr.aria-label]="'library.import.chapters.titleLabel' | t: { index: chapter.index }"
                      (input)="rename(chapter.index, $event)"
                    />
                  </td>
                  <td class="import-chapters-file" data-testid="import-chapters-row-file" [dsTooltip]="chapter.file">
                    {{ fileName(chapter.file) }}
                  </td>
                  <td class="num" data-testid="import-chapters-row-chars">{{ formatCount(chapter.chars) }}</td>
                  <td data-testid="import-chapters-row-check">
                    @for (check of chapter.checks; track check) {
                      <ds-pill kind="warning" icon="alert-triangle">{{
                        checkKeys[check] | t: { index: chapter.sameAs ?? '' }
                      }}</ds-pill>
                    }
                  </td>
                </tr>
              }
              @if (padBottom()) {
                <tr class="import-chapters-spacer" aria-hidden="true">
                  <td colspan="6" [style.height.px]="padBottom()"></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <ds-area-state
          kind="empty"
          icon="book"
          data-testid="import-chapters-empty"
          [heading]="'library.import.chapters.empty.heading' | t"
          [description]="'library.import.chapters.empty.description' | t"
        />
      }
    </section>
  `,
})
class ImportChaptersPreview {
  readonly chapters = model.required<ImportChapter[]>();

  protected readonly checkKeys: Record<ChapterCheck, string> = CHECK_KEYS;
  protected readonly onlyWarnings = signal<boolean>(false);
  protected readonly revealed = signal<number | null>(null);
  protected readonly scrollTop = signal<number>(0);
  private readonly viewportHeight = signal<number>(0);
  private readonly rowHeight = signal<number>(0);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly includedCount: Signal<number> = computed(
    () => this.chapters().filter((chapter: ImportChapter): boolean => chapter.included).length,
  );
  protected readonly warningCount: Signal<number> = computed(() => this.chapters().filter(hasWarnings).length);
  protected readonly shown: Signal<ImportChapter[]> = computed(() =>
    this.onlyWarnings() ? this.chapters().filter(hasWarnings) : this.chapters(),
  );
  protected readonly allShownIncluded: Signal<boolean> = computed(
    () => this.shown().length > 0 && this.shown().every((chapter: ImportChapter): boolean => chapter.included),
  );
  protected readonly range: Signal<RowRange> = computed(() => {
    const total: number = this.shown().length;
    const height: number = this.rowHeight();
    if (!height) return { start: 0, end: Math.min(total, FIRST_PAINT_ROWS) };
    const first: number = Math.floor(this.scrollTop() / height);
    const last: number = Math.ceil((this.scrollTop() + this.viewportHeight()) / height);
    return { start: Math.max(0, first - OVERSCAN_ROWS), end: Math.min(total, last + OVERSCAN_ROWS) };
  });
  protected readonly visibleRows: Signal<ImportChapter[]> = computed(() =>
    this.shown().slice(this.range().start, this.range().end),
  );
  protected readonly padTop: Signal<number> = computed(() => this.range().start * this.rowHeight());
  protected readonly padBottom: Signal<number> = computed(
    () => (this.shown().length - this.range().end) * this.rowHeight(),
  );
  private readonly numberFormat: Signal<Intl.NumberFormat> = computed(
    () => new Intl.NumberFormat(this.i18n.language()),
  );

  constructor() {
    effect((onCleanup) => {
      const element: HTMLElement | undefined = this.viewport()?.nativeElement;
      if (!element) return;
      this.rowHeight.set(parseFloat(getComputedStyle(element).getPropertyValue('--control-h-lg')));
      const observer: ResizeObserver = new ResizeObserver(() => this.viewportHeight.set(element.clientHeight));
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
  }

  protected fileName(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }

  reveal(index: number): void {
    const position: number = this.shown().findIndex((chapter: ImportChapter): boolean => chapter.index === index);
    const element: HTMLElement | undefined = this.viewport()?.nativeElement;
    if (position < 0 || !element) return;
    this.revealed.set(index);
    element.scrollTo({ top: position * this.rowHeight() - (element.clientHeight - this.rowHeight()) / 2 });
  }

  protected formatCount(value: number): string {
    return this.numberFormat().format(value);
  }

  protected filter(onlyWarnings: boolean): void {
    this.onlyWarnings.set(onlyWarnings);
    this.viewport()?.nativeElement.scrollTo({ top: 0 });
    this.scrollTop.set(0);
  }

  protected include(index: number, included: boolean): void {
    this.update((chapter: ImportChapter): boolean => chapter.index === index, { included });
  }

  protected includeShown(included: boolean): void {
    const indexes: Set<number> = new Set(this.shown().map((chapter: ImportChapter): number => chapter.index));
    this.update((chapter: ImportChapter): boolean => indexes.has(chapter.index), { included });
  }

  protected rename(index: number, event: Event): void {
    const title: string = (event.target as HTMLInputElement).value;
    this.update((chapter: ImportChapter): boolean => chapter.index === index, { title });
  }

  private update(match: (chapter: ImportChapter) => boolean, change: Partial<ImportChapter>): void {
    this.chapters.update((list: ImportChapter[]): ImportChapter[] =>
      list.map((chapter: ImportChapter): ImportChapter => (match(chapter) ? { ...chapter, ...change } : chapter)),
    );
  }
}

@Component({
  selector: 'ds-import-package-preview',
  imports: [ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  template: `
    <div class="ds-panel-head">
      <h2>{{ 'library.import.package.heading' | t }}</h2>
      <span class="ds-spacer"></span>
      <button
        dsBtn
        variant="ghost"
        size="sm"
        type="button"
        data-testid="import-change-file"
        [iconOnly]="true"
        [attr.aria-label]="'library.import.page.changeFile' | t"
        [dsTooltip]="'library.import.page.changeFile' | t"
        (click)="change.emit()"
      >
        <ds-icon name="folder" size="sm" />
      </button>
    </div>
    <section class="ds-panel-body import-package" data-testid="import-package">
      <div class="import-package-file" data-testid="import-package-file">
        <ds-icon name="file-zip" />
        <span class="name" [dsTooltip]="preview().file.name" dsTooltipWhenTruncated>{{ preview().file.name }}</span>
        <span class="meta num">{{ fileSize() }}</span>
      </div>
      <dl class="ds-meta-list">
        <dt>{{ 'library.import.package.format' | t }}</dt>
        <dd>{{ 'library.import.package.formatValue' | t: { version: preview().formatVersion } }}</dd>
        <dt>{{ 'library.import.package.type' | t }}</dt>
        <dd>{{ 'library.import.package.typeNovel' | t }}</dd>
        <dt>{{ 'library.import.package.chapters' | t }}</dt>
        <dd class="num">{{ chapterCount() }}</dd>
        <dt>{{ 'library.import.package.cover' | t }}</dt>
        <dd>
          @if (preview().metadata.cover; as cover) {
            <code>{{ cover.name }}</code>
          } @else {
            <span class="meta">{{ 'library.import.package.none' | t }}</span>
          }
        </dd>
        <dt>{{ 'library.import.package.ignored' | t }}</dt>
        <dd data-testid="import-package-ignored">
          @for (file of preview().ignoredFiles; track file) {
            <code>{{ file }}</code>
          } @empty {
            <span class="meta">{{ 'library.import.package.none' | t }}</span>
          }
        </dd>
      </dl>
    </section>
  `,
})
class ImportPackagePreview {
  readonly preview = input.required<ImportPreview>();
  readonly change = output<void>();

  private readonly i18n: I18nService = inject(I18nService);

  protected readonly fileSize: Signal<string> = computed(() =>
    formatBytes(this.preview().file.size, this.i18n.language()),
  );
  protected readonly chapterCount: Signal<string> = computed(() =>
    new Intl.NumberFormat(this.i18n.language()).format(this.preview().chapters.length),
  );
}

interface CheckRow {
  key: string;
  subject: string;
  messageKey: string;
  params: TranslateParams;
  index: number | null;
  included: boolean;
}

const CHECK_MESSAGE_KEYS: Record<ChapterCheck, string> = {
  empty: 'library.import.checks.empty',
  sameText: 'library.import.checks.sameText',
};

function countWarnings(chapters: ImportChapter[], ignoredFiles: string[]): number {
  return chapters.filter(hasWarnings).length + ignoredFiles.length;
}

@Component({
  selector: 'ds-import-checks-preview',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, TranslatePipe],
  template: `
    <div class="ds-panel-head">
      <h2>{{ 'library.import.checks.heading' | t }}</h2>
      @if (rows().length) {
        <span class="meta num" data-testid="import-checks-count">{{
          (rows().length === 1 ? 'library.import.checks.warningsOne' : 'library.import.checks.warnings')
            | t: { count: rows().length }
        }}</span>
      }
      <span class="ds-spacer"></span>
      <span class="meta import-checks-note">{{ 'library.import.checks.note' | t }}</span>
    </div>
    @if (rows().length) {
      <ul class="ds-panel-body import-checks" data-testid="import-checks">
        @for (row of rows(); track row.key) {
          <li [attr.data-included]="row.included" data-testid="import-checks-row">
            <ds-icon name="alert-triangle" size="sm" />
            <span class="subject" [class.mono]="row.index === null">{{ row.subject }}</span>
            <span class="message">{{ row.messageKey | t: row.params }}</span>
            @if (!row.included) {
              <span class="meta">{{ 'library.import.checks.skipped' | t }}</span>
            }
            @if (row.index !== null) {
              <button
                dsBtn
                variant="ghost"
                size="sm"
                type="button"
                data-testid="import-checks-show"
                (click)="reveal.emit(row.index)"
              >
                {{ 'library.import.checks.show' | t }}
              </button>
            }
          </li>
        }
      </ul>
    } @else {
      <ds-area-state
        kind="empty"
        icon="check"
        compact
        data-testid="import-checks-none"
        [heading]="'library.import.checks.none' | t"
        [description]="'library.import.checks.noneDescription' | t"
      />
    }
  `,
})
class ImportChecksPreview {
  readonly chapters = input.required<ImportChapter[]>();
  readonly ignoredFiles = input<string[]>([]);
  readonly reveal = output<number>();

  private readonly i18n: I18nService = inject(I18nService);

  protected readonly rows: Signal<CheckRow[]> = computed(() => [
    ...this.chapters().flatMap((chapter: ImportChapter): CheckRow[] =>
      chapter.checks.map((check: ChapterCheck): CheckRow => ({
        key: `${chapter.index}-${check}`,
        subject: this.i18n.t('library.import.checks.chapter', { index: chapter.index }),
        messageKey: CHECK_MESSAGE_KEYS[check],
        params: { index: chapter.sameAs ?? '' },
        index: chapter.index,
        included: chapter.included,
      })),
    ),
    ...this.ignoredFiles().map((file: string): CheckRow => ({
      key: file,
      subject: file,
      messageKey: 'library.import.checks.ignored',
      params: {},
      index: null,
      included: true,
    })),
  ]);
}

const READING_MS: number = 1200;

@Component({
  selector: 'ds-import-page-preview',
  imports: [
    ButtonDirective,
    DialogComponent,
    IconComponent,
    ImportChaptersPreview,
    ImportChecksPreview,
    ImportMetadataPreview,
    ImportPackagePreview,
    ImportSourcePreview,
    PageTitleDirective,
    PillComponent,
    SplitterDirective,
    TranslatePipe,
  ],
  host: { class: 'ds-page library-import', 'data-testid': 'import-page' },
  template: `
    <div class="ds-page-toolbar">
      <h1 dsPageTitle>{{ 'library.import.page.title' | t }}</h1>
      <ol class="library-import-steps" data-testid="import-steps" [attr.aria-label]="'library.import.page.steps' | t">
        <li [attr.data-state]="previewing() ? 'done' : 'current'" [attr.aria-current]="previewing() ? null : 'step'">
          <span class="mark">
            @if (previewing()) {
              <ds-icon name="check" size="sm" />
            } @else {
              1
            }
          </span>
          {{ 'library.import.page.stepSource' | t }}
        </li>
        <li [attr.data-state]="previewing() ? 'current' : 'todo'" [attr.aria-current]="previewing() ? 'step' : null">
          <span class="mark">2</span>{{ 'library.import.page.stepPreview' | t }}
        </li>
      </ol>
      @if (previewing()) {
        <div class="ds-page-actions">
          @if (warningCount()) {
            <ds-pill kind="warning" icon="alert-triangle" data-testid="import-warnings">{{
              (warningCount() === 1 ? 'library.import.checks.warningsOne' : 'library.import.checks.warnings')
                | t: { count: warningCount() }
            }}</ds-pill>
          }
          <button dsBtn variant="ghost" size="sm" type="button" data-testid="import-cancel" (click)="reset()">
            {{ 'common.cancel' | t }}
          </button>
          <button
            dsBtn
            variant="primary"
            size="sm"
            type="button"
            data-testid="import-start"
            [disabled]="!canImport()"
            (click)="startImport()"
          >
            <ds-icon name="download" size="sm" />{{ 'library.import.page.start' | t: { count: includedLabel() } }}
          </button>
        </div>
      }
    </div>
    @if (previewing() && metadata(); as current) {
      <div class="ds-workbench" data-testid="import-preview">
        <aside
          #left
          class="ds-panel-left library-import-panel"
          data-testid="import-package-panel"
          [attr.aria-label]="'library.import.package.heading' | t"
        >
          @if (preview(); as package) {
            <ds-import-package-preview [preview]="package" (change)="reset()" />
          }
        </aside>
        <ds-splitter edge="left" [target]="left" [label]="'library.import.page.resizePackage' | t" />
        <div class="ds-workbench-center">
          <main class="library-import-main">
            <ds-import-chapters-preview #chapterList [(chapters)]="chapters" />
          </main>
          <ds-splitter edge="bottom" [target]="bottom" [label]="'library.import.page.resizeChecks' | t" />
          <aside
            #bottom
            class="ds-panel-bottom library-import-panel"
            data-testid="import-checks-panel"
            [attr.aria-label]="'library.import.checks.heading' | t"
          >
            <ds-import-checks-preview
              [chapters]="chapters()"
              [ignoredFiles]="ignoredFiles()"
              (reveal)="chapterList.reveal($event)"
            />
          </aside>
        </div>
        <ds-splitter edge="right" [target]="right" [label]="'library.import.page.resizeNovel' | t" />
        <aside
          #right
          class="ds-panel-right library-import-panel"
          data-testid="import-novel-panel"
          [attr.aria-label]="'library.import.metadata.heading' | t"
        >
          <ds-import-metadata-preview [metadata]="current" (metadataChange)="metadata.set($event)" />
        </aside>
      </div>
    } @else {
      <div class="ds-page-body library-import-source">
        <ds-import-source-preview
          [stage]="stage()"
          [file]="file()"
          [sample]="sample()"
          (pick)="pickerOpen.set(true)"
          (dropFiles)="pickerOpen.set(true)"
        />
      </div>
    }
    <ds-dialog
      [open]="pickerOpen()"
      heading="Prototype · choose a sample file"
      [closeLabel]="'common.dismiss' | t"
      (closed)="pickerOpen.set(false)"
    >
      <ul class="library-import-samples" data-testid="import-samples">
        @for (item of samples; track item.id) {
          <li>
            <button
              dsBtn
              variant="ghost"
              type="button"
              [attr.data-testid]="'import-sample-' + item.id"
              (click)="choose(item)"
            >
              {{ item.file.name }} · {{ item.id }}
            </button>
          </li>
        }
      </ul>
    </ds-dialog>
  `,
})
class ImportPagePreview {
  protected readonly samples: ImportSample[] = IMPORT_SAMPLES;
  protected readonly stage = signal<ImportStage>('source');
  protected readonly sample = signal<ImportSample | null>(null);
  protected readonly file = signal<ImportFile | null>(null);
  protected readonly metadata = signal<ImportMetadata | null>(null);
  protected readonly chapters = signal<ImportChapter[]>([]);
  protected readonly pickerOpen = signal<boolean>(false);
  protected readonly previewing: Signal<boolean> = computed(() => this.stage() === 'preview');
  protected readonly preview: Signal<ImportPreview | null> = computed(() => this.sample()?.preview ?? null);
  protected readonly ignoredFiles: Signal<string[]> = computed(() => this.preview()?.ignoredFiles ?? []);
  protected readonly warningCount: Signal<number> = computed(() => countWarnings(this.chapters(), this.ignoredFiles()));
  protected readonly includedCount: Signal<number> = computed(
    () => this.chapters().filter((chapter: ImportChapter): boolean => chapter.included).length,
  );
  protected readonly includedLabel: Signal<string> = computed(() =>
    new Intl.NumberFormat(this.i18n.language()).format(this.includedCount()),
  );
  protected readonly canImport: Signal<boolean> = computed(() => {
    const metadata: ImportMetadata | null = this.metadata();
    return !!metadata && !!metadata.originalTitle.trim() && !!metadata.title.trim() && !!metadata.language;
  });

  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly router: Router = inject(Router);

  protected choose(item: ImportSample): void {
    this.pickerOpen.set(false);
    this.sample.set(item);
    this.file.set(item.file);
    if (item.refusal === 'notZip') {
      this.stage.set('refused');
      return;
    }
    this.stage.set('reading');
    setTimeout(() => this.finishReading(item), READING_MS);
  }

  protected reset(): void {
    this.stage.set('source');
    this.sample.set(null);
    this.file.set(null);
    this.metadata.set(null);
    this.chapters.set([]);
  }

  protected startImport(): void {
    const title: string = this.metadata()?.title ?? '';
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('library.import.page.started', { title }),
      action: {
        label: this.i18n.t('library.import.page.viewPipelines'),
        run: () => void this.router.navigateByUrl('/pipelines'),
      },
    });
    this.reset();
  }

  private finishReading(item: ImportSample): void {
    if (item.preview) {
      this.metadata.set({ ...item.preview.metadata });
      this.chapters.set(item.preview.chapters.map((chapter: ImportChapter): ImportChapter => ({ ...chapter })));
      this.stage.set('preview');
    } else {
      this.stage.set('refused');
    }
  }
}

@Component({
  selector: 'ds-import-story-host',
  imports: [ShellComponent],
  template: '<div style="width: 100vw; height: 100vh"><ds-shell /></div>',
})
class ImportStoryHostComponent implements OnInit {
  readonly route = input<string>('/library/import');
  private readonly router: Router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.route());
  }
}

const routes: Routes = [
  { path: 'library/import', component: ImportPagePreview, data: { module: 'library' } },
  ...buildRoutes(MODULES, ComingSoonPage),
];

interface ImportArgs {
  route: string;
}

const meta: Meta<ImportArgs> = {
  title: 'Pages/Import',
  parameters: { layout: 'fullscreen' },
  args: { route: '/library/import' },
  decorators: [
    moduleMetadata({ imports: [ImportStoryHostComponent] }),
    (story) => {
      const result = story();
      const providers = [provideRouter(routes, withHashLocation()), provideDesktopApi()];
      return {
        ...result,
        applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
      };
    },
  ],
  render: (args) => ({
    props: args,
    template: '<ds-import-story-host [route]="route" />',
  }),
};

export default meta;

type Story = StoryObj<ImportArgs>;

export const Main: Story = {};
