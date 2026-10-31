import { IpcController } from './ipc-controller';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { SettingsChannel } from '@dreamer/shared/ipc/channels';
import { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { SettingsStore } from '../features/settings/settings-store';
import { Broadcaster } from './broadcast-provider';
import { handle } from './handle';

const SECTIONS: string[] = ['general', 'pipeline', 'reading', 'llm'];

export class SettingsController implements IpcController {
  constructor(
    private readonly store: SettingsStore,
    private readonly broadcaster: Broadcaster,
  ) {}

  register(): void {
    handle(SettingsChannel.Get, (): SettingsState => this.store.state());
    handle(SettingsChannel.Update, (_event, patch: SettingsPatch): AppSettings => this.store.update(patch));
    handle(SettingsChannel.Reset, (_event, section: SettingsSection): AppSettings => {
      if (!SECTIONS.includes(section)) {
        throw new CodedError(ErrorCode.SettingsInvalid, `Unknown settings section: ${section}`, 'section');
      }
      return this.store.reset(section);
    });
    this.store.onChange((settings: AppSettings): void => this.broadcaster.send(SettingsChannel.Changed, settings));
  }
}
