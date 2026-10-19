import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../errors/app-error';
import en from './en.json';
import viDictionary from './vi.json';
import { Dictionaries, translate } from './translate';

const dictionaries: Dictionaries = {
  en: { hello: 'Hello', greet: 'Hi {name}, you have {count} items', onlyEn: 'English only' },
  vi: { hello: 'Xin chào' },
};

describe('translate', () => {
  it('looks up the current language', () => {
    expect(translate(dictionaries, 'vi', 'hello')).toBe('Xin chào');
  });

  it('falls back to English when the key is missing', () => {
    expect(translate(dictionaries, 'vi', 'onlyEn')).toBe('English only');
  });

  it('falls back to the key when no language has it', () => {
    expect(translate(dictionaries, 'vi', 'unknown.key')).toBe('unknown.key');
  });

  it('fills params and leaves unknown params as they are', () => {
    expect(translate(dictionaries, 'en', 'greet', { name: 'An' })).toBe('Hi An, you have {count} items');
    expect(translate(dictionaries, 'en', 'greet', { name: 'An', count: 3 })).toBe('Hi An, you have 3 items');
  });

  it('calls onMissing once per miss', () => {
    const onMissing = vi.fn();
    translate(dictionaries, 'vi', 'onlyEn', undefined, onMissing);
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onMissing).toHaveBeenCalledWith('onlyEn');
    translate(dictionaries, 'vi', 'hello', undefined, onMissing);
    expect(onMissing).toHaveBeenCalledTimes(1);
  });
});

describe('dictionary files', () => {
  it('has every vi key in en', () => {
    const missing: string[] = Object.keys(viDictionary).filter((key: string) => !(key in en));
    expect(missing).toEqual([]);
  });

  it('has a title and message for every error code', () => {
    const expected: string[] = Object.values(ErrorCode).flatMap((code: string) => [
      `errors.${code}.title`,
      `errors.${code}.message`,
    ]);
    expect(expected.filter((key: string) => !(key in en))).toEqual([]);
  });
});
