export interface TextMatch {
  start: number;
  end: number;
}

const segmenter: Intl.Segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function findTextMatches(text: string, query: string): TextMatch[] {
  const starts: number[] = [];
  const ends: number[] = [];
  let lower = '';
  let index = 0;
  for (const { segment } of segmenter.segment(text)) {
    const end: number = index + Array.from(segment).length;
    const value: string = segment.normalize('NFC').toLocaleLowerCase();
    lower += value;
    for (let offset = 0; offset < value.length; offset += 1) {
      starts.push(index);
      ends.push(end);
    }
    index = end;
  }
  const needle: string = Array.from(query.normalize('NFC'))
    .map((character: string): string => character.toLocaleLowerCase())
    .join('');
  if (!needle) return [];
  const matches: TextMatch[] = [];
  let offset = 0;
  while (offset < lower.length) {
    const match: number = lower.indexOf(needle, offset);
    if (match < 0) break;
    matches.push({ start: starts[match], end: ends[match + needle.length - 1] });
    offset = match + needle.length;
  }
  return matches;
}
