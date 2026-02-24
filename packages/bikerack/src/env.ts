// Mode detection — entry point determines mode (Story 124-4)
// Default is 'bikerack'; Cyclist overrides to 'cyclist' on import.

let _mode: 'bikerack' | 'cyclist' = 'bikerack';

export function getMode(): 'bikerack' | 'cyclist' {
  return _mode;
}

export function setMode(mode: 'bikerack' | 'cyclist'): void {
  _mode = mode;
}
