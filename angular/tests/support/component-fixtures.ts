import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PanelOutletComponent } from '../../src/shell/layout/panel-outlet.component';

// Mount production outlets directly; the production page registers its own panel templates.
export function createPanelOutlets(): ComponentFixture<PanelOutletComponent>[] {
  return (['left', 'right'] as const).map((edge) => {
    const fixture = TestBed.createComponent(PanelOutletComponent);
    fixture.componentRef.setInput('edge', edge);
    return fixture;
  });
}

export async function settleViews(...fixtures: ComponentFixture<unknown>[]): Promise<void> {
  // TestBed's DOM renderer removes earlier roots when another fixture is created.
  // Keep every real view attached so native inputs dispatch input/change events normally.
  fixtures.forEach((fixture) => {
    const root = fixture.nativeElement as HTMLElement;
    if (!root.isConnected) root.ownerDocument.body.appendChild(root);
  });
  fixtures.forEach((fixture) => fixture.detectChanges());
  await Promise.all(fixtures.map((fixture) => fixture.whenStable()));
  fixtures.forEach((fixture) => fixture.detectChanges());
}
