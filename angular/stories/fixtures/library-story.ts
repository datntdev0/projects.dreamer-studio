import { Component } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import type { OnInit } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import type { Routes } from '@angular/router';
import { withHashLocation } from '@angular/router';
import type { Decorator } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ComingSoonPage } from '@shell/coming-soon/coming-soon.page';
import { MODULES } from '@shell/registry/modules';
import { ShellComponent } from '@shell/shell.component';
import { buildRoutes } from '@shell/shell.routes';
import { SettingsStore } from '@core/stores/settings-store';
import { LibraryPage } from '../../src/features/library/library.page';
import type { ImportState } from '../../src/features/library/library.models';
import type { LibraryScenario } from '../../src/features/library/library.models';
import type { NovelSearchState } from '../../src/features/library/library.models';
import type { NovelTab } from '../../src/features/library/library.models';
import { NovelPage } from '../../src/features/library/novel.page';
import { provideReaderDesktopApi } from './desktop-api';

export interface LibraryStoryArgs {
  route: string;
  scenario: LibraryScenario;
  importState: ImportState;
  chapter: number | null;
  missingChapter: number | null;
  tab: NovelTab;
  searchQuery: string;
  searchState: NovelSearchState;
  focusMode: boolean;
  editing: boolean;
  lock: boolean;
}

@Component({
  selector: 'ds-library-story-host',
  imports: [ShellComponent],
  template: '<div class="library-story-host"><ds-shell [initialRailExpanded]="false" /></div>',
})
export class LibraryStoryHostComponent implements OnInit {
  readonly route = input<string>('/library');
  readonly scenario = input<LibraryScenario>('filled');
  readonly importState = input<ImportState>('paused');
  readonly chapter = input<number | null>(12);
  readonly missingChapter = input<number | null>(null);
  readonly tab = input<NovelTab>('reading');
  readonly searchQuery = input<string>('');
  readonly searchState = input<NovelSearchState>('idle');
  readonly focusMode = input<boolean>(false);
  readonly editing = input<boolean>(false);
  readonly lock = input<boolean>(false);
  private readonly router: Router = inject(Router);
  private readonly settingsStore: SettingsStore = inject(SettingsStore);

  async ngOnInit(): Promise<void> {
    await this.settingsStore.load();
    const route: string = this.chapter() ? `${this.route()}?chapter=${this.chapter()}` : this.route();
    await this.router.navigateByUrl(route);
    if (this.tab() === 'search') {
      setTimeout((): void => {
        document.querySelector<HTMLElement>('[data-testid="novel-page-tab-search"]')?.click();
        const field: HTMLInputElement | null = document.querySelector<HTMLInputElement>(
          '[data-testid="novel-search-input"]',
        );
        if (field && this.searchQuery()) {
          field.value = this.searchQuery();
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      }, 120);
    }
    if (this.focusMode()) {
      setTimeout(() => document.querySelector<HTMLElement>('[data-testid="novel-page-focus"]')?.click());
    }
    if (this.editing()) {
      setTimeout(() => document.querySelector<HTMLElement>('[data-testid="novel-page-edit"]')?.click(), 120);
    }
  }
}

export const libraryStoryRoutes: Routes = [
  { path: 'library', component: LibraryPage, data: { module: 'library' } },
  { path: 'library/import', component: ComingSoonPage, data: { module: 'library' } },
  {
    path: 'library/:id',
    component: NovelPage,
    data: { module: 'library' },
    canDeactivate: [(page: NovelPage) => page.canLeave()],
  },
  ...buildRoutes(MODULES, ComingSoonPage),
];

export const libraryStoryDecorators: Decorator<LibraryStoryArgs>[] = [
  moduleMetadata<LibraryStoryArgs>({ imports: [LibraryStoryHostComponent] }),
  (story, context) => {
    const result = story();
    const providers = [
      provideRouter(libraryStoryRoutes, withHashLocation()),
      provideReaderDesktopApi({
        missingChapter: context.args.missingChapter ?? null,
        lock: context.args.lock ?? false,
        searchDelay: context.args.searchState === 'running' ? 10000 : 120,
      }),
    ];
    return {
      ...result,
      applicationConfig: { providers: [...providers, ...(result.applicationConfig?.providers ?? [])] },
    };
  },
];
