import type { Meta, StoryObj } from '@storybook/angular';
import { DEFAULT_SETTINGS_SCENARIO, settingsStoryDecorators } from '../../fixtures/settings-story';
import type { SettingsStoryArgs } from '../../fixtures/settings-story';

const meta: Meta<SettingsStoryArgs> = {
  title: 'Pages/Settings/General',
  parameters: { layout: 'fullscreen' },
  args: { route: '/settings/general', scenario: DEFAULT_SETTINGS_SCENARIO },
  decorators: settingsStoryDecorators,
  render: (args) => ({
    props: args,
    template: '<ds-settings-story-host [route]="route" />',
  }),
};

export default meta;

type Story = StoryObj<SettingsStoryArgs>;

export const Main: Story = {};

export const Loading: Story = {
  args: { scenario: { ...DEFAULT_SETTINGS_SCENARIO, loading: true } },
};

export const SettingsReset: Story = {
  args: { scenario: { ...DEFAULT_SETTINGS_SCENARIO, settingsReset: true } },
};

export const PipelinesActive: Story = {
  args: { scenario: { ...DEFAULT_SETTINGS_SCENARIO, pipelinesActive: 2, maxConcurrent: 3 } },
};
