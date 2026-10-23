import { dialog, IpcMainInvokeEvent } from 'electron';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NovelImportRequest } from '@dreamer/shared/models/novel-package';
import { createPackagePicker, isImportRequest } from './library-ipc';

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));
vi.mock('../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function validRequest(): NovelImportRequest {
  return {
    path: join(process.cwd(), 'novel.zip'),
    size: 123,
    modifiedMs: 456.5,
    metadata: {
      originalTitle: 'Original',
      title: '',
      author: '',
      description: '',
      tags: ['fantasy'],
      language: 'en',
      publication: 'ongoing',
    },
    cover: { kind: 'package' },
    chapters: [{ index: 1, title: '', included: true }],
  };
}

function changed(change: (request: Record<string, unknown>) => void): unknown {
  const request: Record<string, unknown> = structuredClone(validRequest()) as unknown as Record<string, unknown>;
  change(request);
  return request;
}

describe('isImportRequest', () => {
  it('accepts package, external-file and no-cover requests', () => {
    const request: NovelImportRequest = validRequest();
    expect(isImportRequest(request)).toBe(true);
    expect(isImportRequest({ ...request, cover: { kind: 'none' }, chapters: [] })).toBe(true);
    expect(isImportRequest({ ...request, cover: { kind: 'file', path: join(process.cwd(), 'cover.png') } })).toBe(true);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['relative path', changed((request: Record<string, unknown>): void => void (request.path = 'novel.zip'))],
    [
      'non-zip path',
      changed((request: Record<string, unknown>): void => void (request.path = join(process.cwd(), 'novel.txt'))),
    ],
    ['negative size', changed((request: Record<string, unknown>): void => void (request.size = -1))],
    [
      'infinite size',
      changed((request: Record<string, unknown>): void => void (request.size = Number.POSITIVE_INFINITY)),
    ],
    ['negative mtime', changed((request: Record<string, unknown>): void => void (request.modifiedMs = -1))],
    ['missing metadata', changed((request: Record<string, unknown>): void => void delete request.metadata)],
    [
      'empty original title',
      changed((request: Record<string, unknown>): void => {
        (request.metadata as Record<string, unknown>).originalTitle = ' ';
      }),
    ],
    [
      'empty language',
      changed((request: Record<string, unknown>): void => {
        (request.metadata as Record<string, unknown>).language = '';
      }),
    ],
    [
      'non-string author',
      changed((request: Record<string, unknown>): void => {
        (request.metadata as Record<string, unknown>).author = 1;
      }),
    ],
    [
      'non-string tag',
      changed((request: Record<string, unknown>): void => {
        (request.metadata as Record<string, unknown>).tags = ['ok', 1];
      }),
    ],
    [
      'invalid publication',
      changed((request: Record<string, unknown>): void => {
        (request.metadata as Record<string, unknown>).publication = 'draft';
      }),
    ],
    ['unknown cover kind', changed((request: Record<string, unknown>): void => void (request.cover = { kind: 'url' }))],
    [
      'relative external cover',
      changed((request: Record<string, unknown>): void => void (request.cover = { kind: 'file', path: 'cover.png' })),
    ],
    ['chapters not an array', changed((request: Record<string, unknown>): void => void (request.chapters = {}))],
    [
      'chapter index is zero',
      changed((request: Record<string, unknown>): void => {
        request.chapters = [{ index: 0, title: 'One', included: true }];
      }),
    ],
    [
      'chapter index is fractional',
      changed((request: Record<string, unknown>): void => {
        request.chapters = [{ index: 1.5, title: 'One', included: true }];
      }),
    ],
    [
      'chapter title is not a string',
      changed((request: Record<string, unknown>): void => {
        request.chapters = [{ index: 1, title: null, included: true }];
      }),
    ],
    [
      'chapter included is not boolean',
      changed((request: Record<string, unknown>): void => {
        request.chapters = [{ index: 1, title: 'One', included: 1 }];
      }),
    ],
  ])('rejects %s', (_case: string, value: unknown) => {
    expect(isImportRequest(value)).toBe(false);
  });
});

describe('package picker', () => {
  it('opens subsequent dialogs in the last selected package directory', async () => {
    const selected: string = join(process.cwd(), 'samples', 'novel.zip');
    const showOpenDialog = vi.mocked(dialog.showOpenDialog);
    showOpenDialog
      .mockResolvedValueOnce({ canceled: false, filePaths: [selected] })
      .mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const pickPackage = createPackagePicker();
    const event: IpcMainInvokeEvent = { sender: {} } as IpcMainInvokeEvent;

    await expect(pickPackage(event)).resolves.toBe(selected);
    await expect(pickPackage(event)).resolves.toBeNull();

    expect(showOpenDialog).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ defaultPath: expect.anything() }));
    expect(showOpenDialog).toHaveBeenNthCalledWith(2, expect.objectContaining({ defaultPath: dirname(selected) }));
  });
});
