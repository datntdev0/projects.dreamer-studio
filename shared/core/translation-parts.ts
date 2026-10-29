export const TRANSLATION_PART_CHARS: number = 6000;

export function translationParts(paragraphs: string[], maxChars: number = TRANSLATION_PART_CHARS): string[][] {
  const parts: string[][] = [];
  let part: string[] = [];
  let partChars = 0;

  for (const paragraph of paragraphs) {
    const paragraphChars: number = Array.from(paragraph).length;
    if (paragraphChars > maxChars) {
      if (part.length) {
        parts.push(part);
        part = [];
        partChars = 0;
      }
      parts.push([paragraph]);
      continue;
    }
    if (part.length && partChars + paragraphChars > maxChars) {
      parts.push(part);
      part = [];
      partChars = 0;
    }
    part.push(paragraph);
    partChars += paragraphChars;
  }

  if (part.length) {
    parts.push(part);
  }
  return parts;
}
