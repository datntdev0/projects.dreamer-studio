import { Component, inject, input, linkedSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHostComponent } from '@components/dialog/confirm-host.component';
import { ToastOutletComponent } from '@components/toast/toast-outlet.component';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { SettingsStore } from '@core/stores/settings-store';
import { ThemeService } from '@core/theme/theme.service';
import { PanelOutletComponent } from './layout/panel-outlet.component';
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
    PanelOutletComponent,
    TopbarComponent,
    RailComponent,
    StatusBarComponent,
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  readonly initialRailExpanded = input<boolean>(true);
  private readonly settings: SettingsStore = inject(SettingsStore);
  protected readonly theme: ThemeService = inject(ThemeService);
  protected readonly railExpanded = linkedSignal<boolean>(() => {
    const rail = this.settings.settings()?.rail;
    return rail ? rail === 'full' : this.initialRailExpanded();
  });

  protected toggleRail(): void {
    const expanded: boolean = !this.railExpanded();
    this.railExpanded.set(expanded);
    void this.settings.update({ rail: expanded ? 'full' : 'minimal' });
  }
}
