import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { NovelImportRequest } from '@dreamer/shared/models/novel-package';
import { ToastService } from '@components/toast/toast.service';
import { DesktopApi } from '@core/desktop-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideFakeLibraryApi } from '../../../../stories/fixtures/library-api';
import type { LibrarySampleId } from '../../../../stories/fixtures/library-api';
import { ImportPage } from './import.page';

function query(fixture: ComponentFixture<ImportPage>, testId: string): HTMLElement {
  const element: HTMLElement | null = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing [data-testid="${testId}"]`);
  return element;
}

function has(fixture: ComponentFixture<ImportPage>, testId: string): boolean {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) !== null;
}

async function settle(fixture: ComponentFixture<ImportPage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function click(fixture: ComponentFixture<ImportPage>, testId: string): Promise<void> {
  query(fixture, testId).click();
  await settle(fixture);
}

async function createPage(sample: LibrarySampleId = 'ok'): Promise<ComponentFixture<ImportPage>> {
  await TestBed.configureTestingModule({
    imports: [ImportPage],
    providers: [provideRouter([]), provideFakeLibraryApi(sample)],
  }).compileComponents();
  const fixture: ComponentFixture<ImportPage> = TestBed.createComponent(ImportPage);
  await settle(fixture);
  return fixture;
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImportPage', () => {
  it('REQ-013 AC-2: starts on the source step with a package picker', async () => {
    const fixture: ComponentFixture<ImportPage> = await createPage();

    expect(query(fixture, 'import-source-idle')).not.toBeNull();
    expect(query(fixture, 'import-source-pick')).not.toBeNull();
    expect(has(fixture, 'import-preview')).toBe(false);
    expect(has(fixture, 'import-start')).toBe(false);
  });

  it('REQ-013 AC-3: lists the problems of an invalid package and lets the user pick another file', async () => {
    const fixture: ComponentFixture<ImportPage> = await createPage('problems');

    await click(fixture, 'import-source-pick');

    expect(query(fixture, 'import-source-refused')).not.toBeNull();
    expect(query(fixture, 'import-source-file').textContent).toContain('庆余年-broken.zip');
    expect(query(fixture, 'import-source-problems').querySelectorAll('li')).toHaveLength(5);
    expect(query(fixture, 'import-source-pick')).not.toBeNull();
    expect(has(fixture, 'import-preview')).toBe(false);
  });

  it('REQ-013 AC-4: previews the package metadata, chapters and checks', async () => {
    const fixture: ComponentFixture<ImportPage> = await createPage();

    await click(fixture, 'import-source-pick');

    expect(query(fixture, 'import-preview')).not.toBeNull();
    expect((query(fixture, 'import-metadata-title') as HTMLInputElement).value).toBe('Khánh Dư Niên');
    expect(query(fixture, 'import-chapters-summary').textContent).toContain('748');
    expect(query(fixture, 'import-warnings').textContent).toContain('3');
    expect((query(fixture, 'import-start') as HTMLButtonElement).disabled).toBe(false);
  });

  it('REQ-013 AC-4: blocks the import while the required title is empty', async () => {
    const fixture: ComponentFixture<ImportPage> = await createPage('minimal');

    await click(fixture, 'import-source-pick');

    expect((query(fixture, 'import-metadata-title') as HTMLInputElement).value).toBe('');
    expect((query(fixture, 'import-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('REQ-013 AC-6: starts the import pipeline with the edited preview and offers a link to the pipelines', async () => {
    const fixture: ComponentFixture<ImportPage> = await createPage();
    const importNovel = vi.spyOn(TestBed.inject(DesktopApi), 'importNovel');
    const show = vi.spyOn(TestBed.inject(ToastService), 'show');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await click(fixture, 'import-source-pick');
    const title: HTMLInputElement = query(fixture, 'import-metadata-title') as HTMLInputElement;
    title.value = 'Joy of Life';
    title.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click(fixture, 'import-start');

    const request: NovelImportRequest = importNovel.mock.calls[0][0];
    expect(request.path).toBe('C:\\Samples\\庆余年.zip');
    expect(request.metadata.title).toBe('Joy of Life');
    expect(request.chapters).toHaveLength(748);
    expect(request.cover).toEqual({ kind: 'package' });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info' }));
    show.mock.calls[0][0].action?.run();
    expect(navigate).toHaveBeenCalledWith('/pipelines');
    expect(query(fixture, 'import-source-idle')).not.toBeNull();
  });

  it('returns to the source step when the preview is cancelled', async () => {
    const fixture: ComponentFixture<ImportPage> = await createPage();

    await click(fixture, 'import-source-pick');
    await click(fixture, 'import-cancel');

    expect(query(fixture, 'import-source-idle')).not.toBeNull();
    expect(has(fixture, 'import-preview')).toBe(false);
  });
});
