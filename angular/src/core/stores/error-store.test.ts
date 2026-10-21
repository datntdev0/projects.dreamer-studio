import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { DesktopApi } from '../desktop-api';
import { ErrorStore } from './error-store';

describe('ErrorStore', () => {
  function createStore(): ErrorStore {
    TestBed.configureTestingModule({ providers: [{ provide: DesktopApi, useValue: { onError: () => undefined } }] });
    return TestBed.inject(ErrorStore);
  }

  it('counts repeated errors and dismisses them', () => {
    const store = createStore();
    store.add(ErrorCode.BackendUnavailable);
    store.add(ErrorCode.BackendUnavailable);
    expect(store.errors()).toEqual([{ code: ErrorCode.BackendUnavailable, count: 2 }]);
    store.dismiss(ErrorCode.BackendUnavailable);
    expect(store.errors()).toEqual([]);
  });
});
