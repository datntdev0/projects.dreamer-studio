const MAX_FILE_NAME_LENGTH: number = 120;
const FALLBACK_FILE_NAME: string = 'novel';
const RESERVED_CHARACTERS: string = '<>:"/\\|?*';
const RESERVED_NAMES: RegExp = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function isUnsafeCharacter(character: string): boolean {
  return character.charCodeAt(0) < 32 || RESERVED_CHARACTERS.includes(character);
}

export function safeFileName(title: string): string {
  const cleaned: string = Array.from(title, (character: string): string =>
    isUnsafeCharacter(character) ? ' ' : character,
  )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .replace(/[. ]+$/, '');
  if (cleaned === '') {
    return FALLBACK_FILE_NAME;
  }
  const stem: string = cleaned.split('.')[0].trimEnd();
  return RESERVED_NAMES.test(stem) ? `_${cleaned}` : cleaned;
}
