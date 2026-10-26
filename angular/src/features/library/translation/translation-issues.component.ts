import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { TranslationIssue } from '@dreamer/shared/models/translation';
import { TranslationStore } from '../translation.store';

type IssuesState = 'no-language' | 'loading' | 'not-translated' | 'translated' | 'has-issues' | 'stale' | 'failed';

@Component({
  selector: 'ds-translation-issues',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    NgTemplateOutlet,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './translation-issues.component.html',
  host: {
    class: 'library-translation-issues',
    'data-testid': 'translation-issues',
    '[attr.data-state]': 'state()',
  },
})
export class TranslationIssuesComponent {
  readonly sourceLanguage = input<string | null>(null);
  readonly blockedReason = input<string>('');
  protected readonly store = inject(TranslationStore);
  protected readonly state = computed<IssuesState>(() => {
    if (!this.store.language()) return 'no-language';
    if (this.store.chapterFile() && !this.store.chapter()) return 'loading';
    return this.store.chapter()?.status ?? 'not-translated';
  });
  protected readonly statusKind = computed<'success' | 'warning' | 'danger'>(() => {
    const state = this.state();
    return state === 'failed' ? 'danger' : state === 'stale' || state === 'has-issues' ? 'warning' : 'success';
  });
  protected readonly statusIcon = computed(() => {
    const state = this.state();
    return state === 'failed'
      ? 'alert-circle'
      : state === 'stale'
        ? 'clock'
        : state === 'has-issues'
          ? 'alert-triangle'
          : 'check';
  });
  protected readonly statusKey = computed(
    () => `library.translation.page.issues.status.${this.state() === 'has-issues' ? 'hasIssues' : this.state()}`,
  );

  protected translateChapter(): void {
    const index = this.store.chapter()?.index;
    if (this.blockedReason() || index == null) return;
    this.store.openChapterDialog(index, true);
  }

  protected select(issue: TranslationIssue): void {
    if (this.store.selectedIssue() === issue.id) {
      this.store.selectIssue(null);
    } else {
      this.store.selectIssue(issue.id);
      if (this.store.display() === 'original') this.store.display.set('side');
    }
  }

  protected onIssueKeydown(event: KeyboardEvent, index: number): void {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const buttons = (event.currentTarget as HTMLElement)
      .closest('ul')
      ?.querySelectorAll<HTMLButtonElement>('.library-translation-issue');
    if (buttons?.length) buttons[(index + direction + buttons.length) % buttons.length].focus();
  }

  protected issueIcon(issue: TranslationIssue): string {
    return issue.kind === 'missing-name' ? 'alert-triangle' : issue.kind === 'untranslated-name' ? 'languages' : 'list';
  }

  protected issueKindKey(issue: TranslationIssue): string {
    return `library.translation.page.issues.kind.${issue.kind === 'missing-name' ? 'missingName' : issue.kind === 'untranslated-name' ? 'untranslatedName' : 'paragraphCount'}`;
  }
}
