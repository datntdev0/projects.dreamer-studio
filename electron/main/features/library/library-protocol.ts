import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { isNovelId, NovelCoverFile } from '@dreamer/shared/models/novel-store';
import { AppDataSession } from '../../app/app-data-session';
import { coverPath, novelFolder } from './library-files';
import { coverMime } from './package-reader';

export const libraryScheme: string = 'library-file';

const coverHost: string = 'cover';

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
    const type: string | null = coverMime(bytes);
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
