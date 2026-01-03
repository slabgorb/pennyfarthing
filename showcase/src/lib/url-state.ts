/**
 * URL State Management for Compare Page
 *
 * Encodes/decodes filter state to/from URL query parameters.
 * Enables shareable URLs that restore exact comparison state.
 */

import type { OceanFilters } from '../components/QueryBuilder';

/**
 * Complete state that can be serialized to URL
 */
export interface UrlState {
  oceanFilters: OceanFilters;
  selectedRoles: string[];
  selectedThemes: string[];
  expression: string;
  sortBy: string;
  selectedChars: string[]; // Character IDs in theme:role format
}

/**
 * Default state (used when URL has no params)
 */
export const DEFAULT_STATE: UrlState = {
  oceanFilters: { O: null, C: null, E: null, A: null, N: null },
  selectedRoles: [],
  selectedThemes: [],
  expression: '',
  sortBy: 'name',
  selectedChars: [],
};

/**
 * Encode filter state to URL search params.
 * Only includes non-default values to keep URLs compact.
 */
export function encodeStateToUrl(state: Partial<UrlState>): URLSearchParams {
  const params = new URLSearchParams();

  // OCEAN filters: o=3-5 or o=3 for exact
  if (state.oceanFilters) {
    const dims = ['O', 'C', 'E', 'A', 'N'] as const;
    for (const dim of dims) {
      const range = state.oceanFilters[dim];
      if (range) {
        if (range.min === range.max) {
          params.set(dim.toLowerCase(), String(range.min));
        } else {
          params.set(dim.toLowerCase(), `${range.min}-${range.max}`);
        }
      }
    }
  }

  // Sort (only if not default)
  if (state.sortBy && state.sortBy !== 'name') {
    params.set('sort', state.sortBy);
  }

  // Expression (custom OCEAN query)
  if (state.expression && state.expression.trim()) {
    params.set('q', state.expression.trim());
  }

  // Selected roles
  if (state.selectedRoles && state.selectedRoles.length > 0) {
    state.selectedRoles.forEach(role => params.append('role', role));
  }

  // Selected themes
  if (state.selectedThemes && state.selectedThemes.length > 0) {
    state.selectedThemes.forEach(theme => params.append('theme', theme));
  }

  // Selected characters for comparison
  if (state.selectedChars && state.selectedChars.length > 0) {
    state.selectedChars.forEach(id => params.append('char', id));
  }

  return params;
}

/**
 * Parse OCEAN filter value from URL.
 * Formats: "3" (exact) or "3-5" (range)
 */
function parseOceanValue(value: string): { min: number; max: number } | null {
  if (!value) return null;

  if (value.includes('-')) {
    const [minStr, maxStr] = value.split('-');
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    if (!isNaN(min) && !isNaN(max) && min >= 1 && max <= 5 && min <= max) {
      return { min, max };
    }
  } else {
    const exact = parseInt(value, 10);
    if (!isNaN(exact) && exact >= 1 && exact <= 5) {
      return { min: exact, max: exact };
    }
  }

  return null;
}

/**
 * Decode URL search params to state.
 * Returns complete state with defaults for missing values.
 */
export function decodeUrlToState(params: URLSearchParams): UrlState {
  const state: UrlState = { ...DEFAULT_STATE };

  // OCEAN filters
  const oceanFilters: OceanFilters = { O: null, C: null, E: null, A: null, N: null };
  const dims = ['O', 'C', 'E', 'A', 'N'] as const;
  for (const dim of dims) {
    const value = params.get(dim.toLowerCase());
    if (value) {
      oceanFilters[dim] = parseOceanValue(value);
    }
  }
  state.oceanFilters = oceanFilters;

  // Sort
  const sort = params.get('sort');
  if (sort) {
    state.sortBy = sort;
  }

  // Expression
  const q = params.get('q');
  if (q) {
    state.expression = q;
  }

  // Selected roles (multiple values)
  const roles = params.getAll('role');
  if (roles.length > 0) {
    state.selectedRoles = roles;
  }

  // Selected themes (multiple values)
  const themes = params.getAll('theme');
  if (themes.length > 0) {
    state.selectedThemes = themes;
  }

  // Selected characters (multiple values)
  const chars = params.getAll('char');
  if (chars.length > 0) {
    state.selectedChars = chars;
  }

  return state;
}

/**
 * Update browser URL without navigation.
 * Uses replaceState to avoid creating history entries for every filter change.
 */
export function updateBrowserUrl(state: Partial<UrlState>): void {
  const params = encodeStateToUrl(state);
  const search = params.toString();
  const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;

  window.history.replaceState(null, '', newUrl);
}

/**
 * Get current URL state from browser location.
 */
export function getUrlState(): UrlState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE;
  }
  const params = new URLSearchParams(window.location.search);
  return decodeUrlToState(params);
}

/**
 * Build shareable URL from current state.
 */
export function buildShareableUrl(state: Partial<UrlState>): string {
  const params = encodeStateToUrl(state);
  const search = params.toString();
  const base = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '/compare';

  return search ? `${base}?${search}` : base;
}

/**
 * Copy text to clipboard with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers or permission issues
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }
}
