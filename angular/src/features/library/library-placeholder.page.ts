import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PageTitleDirective } from '@shell/page-title.directive';

@Component({
  selector: 'ds-library-placeholder-page',
  imports: [RouterLink, ButtonDirective, IconComponent, PillComponent, PageTitleDirective, TranslatePipe],
  templateUrl: './library-placeholder.page.html',
  host: { class: 'ds-page', 'data-testid': 'page-library-placeholder' },
})
export class LibraryPlaceholderPage {}
