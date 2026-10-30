import { describe, expect, it } from 'vitest';
import type { PanelDirective } from './panel.directive';
import { LayoutService } from './layout.service';

describe('[TH01-03] LayoutService', () => {
  it('registers panels, toggles visibility per edge, and unregisters only the current panel', () => {
    const layout = new LayoutService();
    const left = { edge: () => 'left' } as unknown as PanelDirective;
    const replacement = { edge: () => 'left' } as unknown as PanelDirective;
    const right = { edge: () => 'right' } as unknown as PanelDirective;

    layout.register(left);
    layout.register(right);
    expect(layout.visible('left')).toBe(left);
    expect(layout.visible('right')).toBe(right);

    layout.toggle('left');
    expect(layout.visible('left')).toBeNull();
    expect(layout.visible('right')).toBe(right);
    layout.toggle('left');
    expect(layout.visible('left')).toBe(left);

    layout.register(replacement);
    layout.unregister(left);
    expect(layout.visible('left')).toBe(replacement);
    layout.unregister(replacement);
    expect(layout.has('left')).toBe(false);
  });
});
