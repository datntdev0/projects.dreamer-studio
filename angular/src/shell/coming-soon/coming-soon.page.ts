import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { AppInfoStore } from '@core/app-info';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PageTitleDirective } from '../page-title.directive';
import { AppModule, MODULES } from '../registry/modules';

interface ReleaseText {
  key: string;
  params?: TranslateParams;
}

@Component({
  selector: 'ds-coming-soon-page',
  imports: [RouterLink, ButtonDirective, IconComponent, PillComponent, PageTitleDirective, TranslatePipe],
  templateUrl: './coming-soon.page.html',
  host: { class: 'ds-page', 'data-testid': 'page-coming-soon' },
})
export class ComingSoonPage {
  private readonly appInfo: AppInfoStore = inject(AppInfoStore);
  private readonly moduleId = toSignal(inject(ActivatedRoute).data.pipe(map((data) => data['module'] as string)));

  protected readonly module = computed<AppModule | undefined>(() =>
    MODULES.find((entry) => entry.id === this.moduleId()),
  );
  protected readonly release = computed<ReleaseText>(() => {
    const release = this.module()?.release ?? null;
    if (release === null) {
      return { key: 'soon.tbd' };
    }
    return release === this.appInfo.info()?.version
      ? { key: 'soon.thisRelease' }
      : { key: 'soon.release', params: { version: release } };
  });
}
