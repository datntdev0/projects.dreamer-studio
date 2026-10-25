import type { Meta, StoryObj } from '@storybook/angular';
import { DEFAULT_SETTINGS_SCENARIO, settingsStoryDecorators } from '../../fixtures/settings-story';
import type { SettingsStoryArgs } from '../../fixtures/settings-story';

const meta: Meta<SettingsStoryArgs> = {
  title: 'Pages/Settings/Diagnostics',
  parameters: { layout: 'fullscreen' },
  args: { route: '/settings/diagnostics', scenario: DEFAULT_SETTINGS_SCENARIO },
  decorators: settingsStoryDecorators,
  render: (args) => ({
    props: args,
    template: '<ds-settings-story-host [route]="route" />',
  }),
};

export default meta;

type Story = StoryObj<SettingsStoryArgs>;

export const Main: Story = {};

export const AllChecksOk: Story = {
  args: { scenario: { ...DEFAULT_SETTINGS_SCENARIO, diagnostics: 'ok' } },
};

export const ChecksEngineError: Story = {
  args: { scenario: { ...DEFAULT_SETTINGS_SCENARIO, diagnostics: 'engineError' } },
};

export const DevBuild: Story = {
  args: { scenario: { ...DEFAULT_SETTINGS_SCENARIO, devBuild: true } },
};
