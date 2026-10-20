import { SettingsChannel } from '@dreamer/shared/ipc/channels';
import { SettingsState } from '@dreamer/shared/models/settings';
import { SettingsStore } from '../settings/settings-store';
import { handle } from './handle';

export function registerSettingsIpc(store: SettingsStore): void {
  handle(SettingsChannel.Get, (): SettingsState => store.state());
}
