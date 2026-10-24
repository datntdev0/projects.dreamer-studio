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
import { LibraryMockStore } from '../../src/features/library/library.store';
import { NovelPage } from '../../src/features/library/novel.page';
import { provideReaderDesktopApi } from './desktop-api';
import { makeChapters } from './library';
import { CHAPTER_PARAGRAPHS } from './library';
import { NO_CHAPTERS_NOVEL } from './library';
import { NOVELS } from './library';
import { SAMPLE_PARAGRAPHS } from './library';

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
  private readonly store: LibraryMockStore = inject(LibraryMockStore);
  private readonly settingsStore: SettingsStore = inject(SettingsStore);

  async ngOnInit(): Promise<void> {
    await this.settingsStore.load();
    const novelId: string = this.route().split('/').at(-1) ?? '';
    const novels = novelId === NO_CHAPTERS_NOVEL.id ? [...NOVELS, NO_CHAPTERS_NOVEL] : NOVELS;
    this.store.load({
      novels,
      sampleParagraphs: SAMPLE_PARAGRAPHS,
      paragraphsByChapter: CHAPTER_PARAGRAPHS,
      makeChapters,
    });
    this.store.setScenario(this.scenario());
    this.store.importState.set(this.importState());
    const route: string = this.chapter() ? `${this.route()}?chapter=${this.chapter()}` : this.route();
    await this.router.navigateByUrl(route);
    if (this.focusMode()) {
      setTimeout(() => document.querySelector<HTMLElement>('[data-testid="novel-page-focus"]')?.click());
    }
  }
}

const routes: Routes = [
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
      provideRouter(routes, withHashLocation()),
      provideReaderDesktopApi({
        missingChapter: context.args.missingChapter ?? null,
        lock: context.args.lock ?? false,
      }),
    ];
    return {
      ...result,
      applicationConfig: { providers: [...(result.applicationConfig?.providers ?? []), ...providers] },
    };
  },
];
