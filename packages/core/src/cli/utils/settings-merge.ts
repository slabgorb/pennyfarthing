/**
 * Shared merge model for settings.local.json
 * Enables multi-framework coexistence with namespace isolation.
 *
 * Story 98-11: Settings.local.json shared merge model for multi-framework coexistence
 *
 * Each framework contributes its settings under a namespace key.
 * The merge engine combines contributions into a flat output that
 * Claude Code can consume unchanged.
 */

// =============================================================================
// Types
// =============================================================================

export interface HookCommand {
  type?: string;
  command: string;
}

export interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

export interface FrameworkContribution {
  version: string;
  hooks?: Record<string, HookEntry[]>;
  permissions?: { allow: string[] };
  statusLine?: { type: string; command: string };
  context_budget?: { warning_threshold: number; critical_threshold: number; max_tokens: number };
}

export interface FrameworkMeta {
  version: string;
  installed_at: string;
  priority?: number;
}

export interface SharedSettings {
  _version: number;
  _frameworks: Record<string, FrameworkMeta>;
  _contributions: Record<string, FrameworkContribution>;
  // Merged output (computed from all contributions)
  hooks: Record<string, HookEntry[]>;
  permissions: { allow: string[] };
  statusLine?: { type: string; command: string };
  context_budget?: { warning_threshold: number; critical_threshold: number; max_tokens: number };
}

export interface MergeConflict {
  type: 'hook_duplicate' | 'permission_overlap' | 'scalar_collision';
  frameworks: string[];
  key: string;
  detail: string;
}

export interface MergeResult {
  settings: SharedSettings;
  conflicts: MergeConflict[];
}

// =============================================================================
// Schema Version
// =============================================================================

export const SHARED_SETTINGS_VERSION = 2;

// =============================================================================
// Core Functions — Stubs (to be implemented in GREEN phase)
// =============================================================================

/**
 * Create an empty SharedSettings structure.
 */
export function createEmptySharedSettings(): SharedSettings {
  // STUB: Return empty structure
  return {
    _version: SHARED_SETTINGS_VERSION,
    _frameworks: {},
    _contributions: {},
    hooks: {},
    permissions: { allow: [] },
  };
}

/**
 * Add or update a framework's contribution to the shared settings.
 * Re-merges all contributions after updating.
 */
export function contributeFrameworkSettings(
  settings: SharedSettings,
  frameworkId: string,
  contribution: FrameworkContribution
): MergeResult {
  // STUB: not implemented
  return { settings, conflicts: [] };
}

/**
 * Remove a framework's contribution from the shared settings.
 * Re-merges remaining contributions.
 */
export function removeFrameworkSettings(
  settings: SharedSettings,
  frameworkId: string
): SharedSettings {
  // STUB: not implemented
  return settings;
}

/**
 * Merge all framework hook contributions into a unified hooks object.
 * Hooks from different frameworks are concatenated per hook type.
 * Duplicate commands within same framework are deduplicated.
 */
export function mergeHooks(
  contributions: Record<string, FrameworkContribution>
): Record<string, HookEntry[]> {
  // STUB: not implemented
  return {};
}

/**
 * Merge all framework permission contributions into a unified allow list.
 * Permissions are unioned and deduplicated.
 */
export function mergePermissions(
  contributions: Record<string, FrameworkContribution>
): { allow: string[] } {
  // STUB: not implemented
  return { allow: [] };
}

/**
 * Resolve scalar values (statusLine, context_budget) from multiple frameworks.
 * Uses framework priority (lower number = higher priority).
 * Falls back to alphabetical ordering if priority is equal.
 */
export function resolveScalar<T>(
  contributions: Record<string, FrameworkContribution>,
  frameworks: Record<string, FrameworkMeta>,
  key: keyof FrameworkContribution
): T | undefined {
  // STUB: not implemented
  return undefined;
}

/**
 * Detect conflicts between framework contributions.
 * Returns list of conflicts found.
 */
export function detectConflicts(
  contributions: Record<string, FrameworkContribution>
): MergeConflict[] {
  // STUB: not implemented
  return [];
}

/**
 * Migrate a legacy (v1) settings.local.json to the shared (v2) format.
 * The existing content is attributed to the specified framework.
 */
export function migrateToSharedFormat(
  legacySettings: Record<string, unknown>,
  frameworkId: string,
  frameworkVersion: string
): SharedSettings {
  // STUB: not implemented
  return createEmptySharedSettings();
}

/**
 * Check if a settings object is in the shared (v2) format.
 */
export function isSharedFormat(settings: unknown): settings is SharedSettings {
  if (typeof settings !== 'object' || settings === null) return false;
  return (settings as Record<string, unknown>)._version === SHARED_SETTINGS_VERSION;
}

/**
 * Export the merged settings in Claude Code-compatible flat format.
 * Strips internal _version, _frameworks, _contributions fields.
 */
export function toFlatFormat(settings: SharedSettings): Record<string, unknown> {
  // STUB: not implemented
  return {};
}

/**
 * Validate a SharedSettings structure.
 */
export function validateSharedSettings(settings: unknown): { valid: boolean; errors: string[] } {
  // STUB: not implemented
  return { valid: false, errors: ['not implemented'] };
}
