import type { Meta, StoryObj } from '@storybook/angular';

const meta: Meta = {
  title: 'Foundations/Introduction',
  render: () => ({
    template: `
      <h1>Dreamer Studio design system</h1>
      <p>Tokens, components and layout patterns for the desktop studio.</p>
      <p>Use the Theme item in the toolbar to switch between light and dark.</p>
    `,
  }),
};

export default meta;

export const Introduction: StoryObj = {};
