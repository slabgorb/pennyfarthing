/**
 * Theme loading and discovery via pf CLI subprocess delegation.
 * Story 141-17: Replaced filesystem operations with child_process calls to pf CLI.
 */

import { callPf } from './pf-cli.js';

// ---------------------------------------------------------------------------
// Types (kept stable — same exported interfaces)
// ---------------------------------------------------------------------------

export interface ThemeAgent {
  character: string;
  style: string;
  role: string;
  trait: string;
  catchphrases: string[];
  helper?: string;
}

export interface Theme {
  name: string;
  description: string;
  agents: Record<string, ThemeAgent>;
}

export interface ThemePackageInfo {
  packageName: string;
  themesDir: string;
  portraitsDir: string;
}

export interface ThemeMetadata {
  id: string;
  name: string;
  description: string;
  source: string;
  tier: string | null;
  category: string;
  agentCount: number;
}

// ---------------------------------------------------------------------------
// Internal result helpers: { success: true, data } / { success: false, error }
// ---------------------------------------------------------------------------

function _wrapResult<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

function _wrapError(error: string): { success: false; error: string } {
  return { success: false, error };
}

// ---------------------------------------------------------------------------
// CLI-delegated functions
// ---------------------------------------------------------------------------

/**
 * Discover installed theme packages.
 * Now handled internally by pf CLI — returns empty for direct callers.
 */
export function discoverThemePackages(_projectRoot?: string): ThemePackageInfo[] {
  return [];
}

/**
 * Discover all theme directories.
 * Now handled internally by pf CLI — returns empty for direct callers.
 */
export function discoverAllThemeDirs(_projectRoot?: string): string[] {
  return [];
}

/**
 * Resolve the file path for a specific theme.
 * Now handled internally by pf CLI — returns null for direct callers.
 */
export function resolveThemePath(_themeId: string, _projectRoot?: string): string | null {
  return null;
}

/**
 * Load metadata for all discoverable themes via pf theme list --json.
 */
export function loadAllThemeMetadata(projectRoot?: string): ThemeMetadata[] {
  const r = callPf<ThemeMetadata[]>(['theme', 'list', '--json'], projectRoot);
  return r.success && r.data ? r.data : [];
}

/**
 * Load a theme configuration by name via pf theme show --json.
 */
export function loadTheme(themeName: string): Theme | null {
  const r = callPf<Theme>(['theme', 'show', themeName, '--json']);
  if (!r.success || !r.data) return null;
  return r.data;
}

/**
 * List all available theme IDs via pf theme list --json.
 */
export function listThemes(projectRoot?: string): string[] {
  const metadata = loadAllThemeMetadata(projectRoot);
  return metadata.map(m => m.id);
}

/**
 * Get agent persona from a theme via pf theme show --json.
 */
export function getAgentPersona(themeName: string, agentName: string): ThemeAgent | null {
  const theme = loadTheme(themeName);
  if (!theme) return null;
  return theme.agents[agentName] || null;
}
