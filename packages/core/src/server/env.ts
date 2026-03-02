// Mode detection — entry point determines mode (Story 124-4)
// Default is 'bikerack'; GUI overrides to 'gui' on import.

let _mode: 'bikerack' | 'gui' = 'bikerack';

export function getMode(): 'bikerack' | 'gui' {
  return _mode;
}

export function setMode(mode: 'bikerack' | 'gui'): void {
  _mode = mode;
}
