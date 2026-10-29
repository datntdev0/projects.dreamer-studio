import { Injectable, signal } from '@angular/core';
import type { TargetLanguage } from '@dreamer/shared/models/translation';

@Injectable({ providedIn: 'root' })
export class TranslationLanguageStore {
  private readonly languages = signal<Map<string, TargetLanguage>>(new Map());

  language(novelId: string): TargetLanguage | null {
    return this.languages().get(novelId) ?? null;
  }

  set(novelId: string, language: TargetLanguage): void {
    this.languages.update((languages) => new Map(languages).set(novelId, language));
  }
}
