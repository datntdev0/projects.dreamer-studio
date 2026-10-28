import { WorldDraftEdit } from '@dreamer/shared/models/analysis';
import { NovelFolder } from '../library/library-files';
import { readWorldOverlay, writeWorldOverlay } from './analysis-files';

export function overlayEdits(folder: NovelFolder): WorldDraftEdit[] {
  return readWorldOverlay(folder)?.edits ?? [];
}

export function appendOverlayEdits(folder: NovelFolder, edits: WorldDraftEdit[]): Promise<void> {
  return writeWorldOverlay(folder, { version: 2, edits: [...overlayEdits(folder), ...edits] });
}
