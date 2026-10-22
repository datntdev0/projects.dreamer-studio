export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function splitParagraphs(text: string): string[] {
  return normalizeLineEndings(text)
    .split('\n')
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.length > 0);
}

export function normalizeChapterText(text: string): string {
  return splitParagraphs(text).join('\n');
}

export interface ChapterStats {
  paragraphs: number;
  chars: number;
}

export function chapterStats(text: string): ChapterStats {
  const paragraphs: number = text ? text.split('\n').length : 0;
  const chars: number = Array.from(text).filter((character: string): boolean => character !== '\n').length;
  return { paragraphs, chars };
}

export async function contentHash(text: string): Promise<string> {
  const bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(text);
  const digest: ArrayBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
}
