import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHostComponent } from '@components/dialog/confirm-host.component';
import { ToastOutletComponent } from '@components/toast/toast-outlet.component';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ThemeService } from '../core/theme/theme.service';
import { RailComponent } from './rail/rail.component';
import { StatusBarComponent } from './status-bar/status-bar.component';
import { TopbarComponent } from './topbar/topbar.component';

@Component({
  selector: 'ds-shell',
  imports: [
    RouterOutlet,
    TranslatePipe,
    ConfirmHostComponent,
    ToastOutletComponent,
    TopbarComponent,
    RailComponent,
    StatusBarComponent,
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  protected readonly theme: ThemeService = inject(ThemeService);
  protected readonly railExpanded = signal<boolean>(true);
}
