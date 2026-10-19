import { EnvironmentProviders, provideAppInitializer } from '@angular/core';

const SPRITE_URL = 'icons.svg';
const SPRITE_ATTRIBUTE = 'data-icon-sprite';

async function insertIconSprite(): Promise<void> {
  if (document.body.querySelector(`[${SPRITE_ATTRIBUTE}]`)) {
    return;
  }
  const response = await fetch(SPRITE_URL);
  if (!response.ok) {
    return;
  }
  const holder = document.createElement('div');
  holder.setAttribute(SPRITE_ATTRIBUTE, '');
  holder.hidden = true;
  holder.innerHTML = await response.text();
  if (!document.body.querySelector(`[${SPRITE_ATTRIBUTE}]`)) {
    document.body.prepend(holder);
  }
}

export function provideIconSprite(): EnvironmentProviders {
  return provideAppInitializer(insertIconSprite);
}
