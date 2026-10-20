import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { SettingsChannel } from '@dreamer/shared/ipc/channels';
import { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { SettingsStore } from '../settings/settings-store';
import { broadcast } from './broadcast';
import { handle } from './handle';

const SECTIONS: string[] = ['general', 'pipeline'];

export function registerSettingsIpc(store: SettingsStore): void {
  handle(SettingsChannel.Get, (): SettingsState => store.state());
  handle(SettingsChannel.Update, (_event, patch: SettingsPatch): AppSettings => store.update(patch));
  handle(SettingsChannel.Reset, (_event, section: SettingsSection): AppSettings => {
    if (!SECTIONS.includes(section)) {
      throw new CodedError(ErrorCode.SettingsInvalid, `Unknown settings section: ${section}`, 'section');
    }
    return store.reset(section);
  });
  store.onChange((settings: AppSettings): void => broadcast(SettingsChannel.Changed, settings));
}
