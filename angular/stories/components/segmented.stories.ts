import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { FieldComponent } from '@components/form/field.component';
import { SegmentedComponent, SegmentedOption } from '@components/form/segmented.component';

const THEME_OPTIONS: SegmentedOption[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];
const ICON_OPTIONS: SegmentedOption[] = [
  { value: 'list', label: 'List view', icon: 'list' },
  { value: 'grid', label: 'Grid view', icon: 'grid' },
  { value: 'columns', label: 'Column view', icon: 'columns' },
];
const TEXT_OPTIONS: SegmentedOption[] = [
  { value: 'one', label: 'Bản dịch tự động' },
  { value: 'two', label: 'Bản dịch đã duyệt bởi biên tập viên' },
  { value: 'three', label: 'Bản gốc' },
];

const meta: Meta = {
  title: 'Components/Segmented',
  decorators: [moduleMetadata({ imports: [FieldComponent, SegmentedComponent] })],
  render: () => ({
    props: { themes: THEME_OPTIONS, icons: ICON_OPTIONS, texts: TEXT_OPTIONS },
    template: `
      <div class="sb-doc">
        <div class="sb-row">
          <ds-field label="Theme">
            <ds-segmented label="Theme" [options]="themes" value="dark" />
          </ds-field>
          <ds-field label="Icon only (tooltip)">
            <ds-segmented label="View" [options]="icons" [iconOnly]="true" value="list" />
          </ds-field>
          <ds-field label="Nothing selected">
            <ds-segmented label="Source" [options]="texts" />
          </ds-field>
        </div>
      </div>
    `,
  }),
};

export default meta;

export const Segmented: StoryObj = {};
