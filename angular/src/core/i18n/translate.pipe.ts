import { Pipe, PipeTransform, inject } from '@angular/core';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { I18nService } from './i18n.service';

@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: string, params?: TranslateParams): string {
    return this.i18n.t(key, params);
  }
}
