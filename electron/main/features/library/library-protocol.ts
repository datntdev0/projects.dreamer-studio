import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { isNovelId, NovelCoverFile } from '@dreamer/shared/models/novel-store';
import { AppDataSession } from '../../app/app-data-session';
import { coverPath, novelFolder } from './library-files';

export const libraryScheme: string = 'library-file';

const coverHost: string = 'cover';
const jpegMagic: number[] = [0xff, 0xd8, 0xff];
const pngMagic: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((value: number, index: number): boolean => bytes[index] === value);
}

function imageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, jpegMagic)) {
    return 'image/jpeg';
  }
  return startsWith(bytes, pngMagic) ? 'image/png' : null;
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

async function coverResponse(session: AppDataSession, id: string): Promise<Response> {
  const cover: NovelCoverFile | null = session.index.coverFile(id);
  if (cover === null) {
    return notFound();
  }
  try {
    const bytes: Awaited<ReturnType<typeof readFile>> = await readFile(
      coverPath(novelFolder(session.paths, id), cover),
    );
    const type: string | null = imageType(bytes);
    return type === null ? notFound() : new Response(bytes, { headers: { 'Content-Type': type } });
  } catch {
    return notFound();
  }
}

export function handleLibraryProtocol(session: () => AppDataSession): void {
  protocol.handle(libraryScheme, (request: Request): Promise<Response> | Response => {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405 });
    }
    const url: URL = new URL(request.url);
    const id: string = url.pathname.slice(1);
    if (url.hostname !== coverHost || !isNovelId(id)) {
      return notFound();
    }
    return coverResponse(session(), id);
  });
}
