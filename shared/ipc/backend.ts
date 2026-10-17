export type BackendState = 'starting' | 'running' | 'unavailable';

export interface BackendStatus {
  state: BackendState;
}
