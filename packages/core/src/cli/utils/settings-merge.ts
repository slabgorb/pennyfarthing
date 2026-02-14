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
  type: 'hook_duplicate' | 'scalar_collision';
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
// Internal helpers
// =============================================================================

/**
 * Serialise a HookEntry to a string key for dedup purposes.
 */
function hookEntryKey(entry: HookEntry): string {
  const cmds = entry.hooks.map(h => h.command).join('|');
  return `${entry.matcher ?? ''}::${cmds}`;
}

/**
 * Re-compute merged output fields from contributions and framework metadata.
 */
function remerge(settings: SharedSettings): void {
  settings.hooks = mergeHooks(settings._contributions);
  settings.permissions = mergePermissions(settings._contributions);
  settings.statusLine = resolveScalar<{ type: string; command: string }>(
    settings._contributions, settings._frameworks, 'statusLine'
  );
  settings.context_budget = resolveScalar<{ warning_threshold: number; critical_threshold: number; max_tokens: number }>(
    settings._contributions, settings._frameworks, 'context_budget'
  );
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Create an empty SharedSettings structure.
 */
export function createEmptySharedSettings(): SharedSettings {
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
  const result: SharedSettings = JSON.parse(JSON.stringify(settings));

  // Store contribution
  result._contributions[frameworkId] = JSON.parse(JSON.stringify(contribution));

  // Store/update framework metadata — preserve existing installed_at on updates
  const existing = result._frameworks[frameworkId];
  result._frameworks[frameworkId] = {
    version: contribution.version,
    installed_at: existing?.installed_at ?? new Date().toISOString(),
    ...(existing?.priority != null ? { priority: existing.priority } : {}),
  };

  // Recompute merged output
  remerge(result);

  // Detect conflicts
  const conflicts = detectConflicts(result._contributions);

  return { settings: result, conflicts };
}

/**
 * Remove a framework's contribution from the shared settings.
 * Re-merges remaining contributions.
 */
export function removeFrameworkSettings(
  settings: SharedSettings,
  frameworkId: string
): SharedSettings {
  const result: SharedSettings = JSON.parse(JSON.stringify(settings));

  if (!(frameworkId in result._contributions)) {
    return result;
  }

  delete result._contributions[frameworkId];
  delete result._frameworks[frameworkId];

  // Recompute merged output
  remerge(result);

  return result;
}

/**
 * Merge all framework hook contributions into a unified hooks object.
 * Hooks from different frameworks are concatenated per hook type.
 * Duplicate commands within same framework are deduplicated.
 */
export function mergeHooks(
  contributions: Record<string, FrameworkContribution>
): Record<string, HookEntry[]> {
  const merged: Record<string, HookEntry[]> = {};

  for (const frameworkId of Object.keys(contributions)) {
    const hooks = contributions[frameworkId].hooks;
    if (!hooks) continue;

    for (const hookType of Object.keys(hooks)) {
      if (!merged[hookType]) {
        merged[hookType] = [];
      }

      // Deduplicate within this framework
      const seen = new Set<string>();
      for (const entry of hooks[hookType]) {
        const key = hookEntryKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        merged[hookType].push(JSON.parse(JSON.stringify(entry)));
      }
    }
  }

  return merged;
}

/**
 * Merge all framework permission contributions into a unified allow list.
 * Permissions are unioned, deduplicated, and sorted alphabetically.
 */
export function mergePermissions(
  contributions: Record<string, FrameworkContribution>
): { allow: string[] } {
  const allPerms = new Set<string>();

  for (const frameworkId of Object.keys(contributions)) {
    const perms = contributions[frameworkId].permissions;
    if (!perms?.allow) continue;
    for (const p of perms.allow) {
      allPerms.add(p);
    }
  }

  return { allow: [...allPerms].sort() };
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
  // Collect frameworks that contribute this key
  const candidates: Array<{ frameworkId: string; value: unknown }> = [];

  for (const frameworkId of Object.keys(contributions)) {
    const val = contributions[frameworkId][key];
    if (val !== undefined && val !== null) {
      candidates.push({ frameworkId, value: val });
    }
  }

  if (candidates.length === 0) return undefined;

  // Sort by priority (lower = higher priority), then alphabetical
  candidates.sort((a, b) => {
    const aPri = frameworks[a.frameworkId]?.priority ?? Infinity;
    const bPri = frameworks[b.frameworkId]?.priority ?? Infinity;
    if (aPri !== bPri) return aPri - bPri;
    return a.frameworkId.localeCompare(b.frameworkId);
  });

  return candidates[0].value as T;
}

/**
 * Detect conflicts between framework contributions.
 * Returns list of conflicts found.
 */
export function detectConflicts(
  contributions: Record<string, FrameworkContribution>
): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  const frameworkIds = Object.keys(contributions);

  if (frameworkIds.length < 2) return [];

  // Check for duplicate hook commands across frameworks
  // Build a map of command → list of frameworks
  const hookCommandMap: Record<string, Record<string, string[]>> = {};

  for (const fwId of frameworkIds) {
    const hooks = contributions[fwId].hooks;
    if (!hooks) continue;
    for (const hookType of Object.keys(hooks)) {
      if (!hookCommandMap[hookType]) hookCommandMap[hookType] = {};
      for (const entry of hooks[hookType]) {
        for (const h of entry.hooks) {
          if (!hookCommandMap[hookType][h.command]) {
            hookCommandMap[hookType][h.command] = [];
          }
          if (!hookCommandMap[hookType][h.command].includes(fwId)) {
            hookCommandMap[hookType][h.command].push(fwId);
          }
        }
      }
    }
  }

  for (const hookType of Object.keys(hookCommandMap)) {
    for (const command of Object.keys(hookCommandMap[hookType])) {
      const fws = hookCommandMap[hookType][command];
      if (fws.length > 1) {
        conflicts.push({
          type: 'hook_duplicate',
          frameworks: [...fws],
          key: `hooks.${hookType}`,
          detail: `Duplicate hook command "${command}" in ${hookType} from frameworks: ${fws.join(', ')}`,
        });
      }
    }
  }

  // Check for scalar collisions (statusLine, context_budget)
  for (const scalarKey of ['statusLine', 'context_budget'] as const) {
    const contributors: string[] = [];
    for (const fwId of frameworkIds) {
      if (contributions[fwId][scalarKey] !== undefined) {
        contributors.push(fwId);
      }
    }
    if (contributors.length > 1) {
      conflicts.push({
        type: 'scalar_collision',
        frameworks: contributors,
        key: scalarKey,
        detail: `Multiple frameworks contribute ${scalarKey}: ${contributors.join(', ')}`,
      });
    }
  }

  return conflicts;
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
  const settings = createEmptySharedSettings();

  // Extract known fields into a contribution
  const contribution: FrameworkContribution = {
    version: frameworkVersion,
  };

  if (legacySettings.hooks && typeof legacySettings.hooks === 'object') {
    contribution.hooks = legacySettings.hooks as Record<string, HookEntry[]>;
  }

  if (legacySettings.permissions && typeof legacySettings.permissions === 'object') {
    contribution.permissions = legacySettings.permissions as { allow: string[] };
  }

  if (legacySettings.statusLine && typeof legacySettings.statusLine === 'object') {
    contribution.statusLine = legacySettings.statusLine as { type: string; command: string };
  }

  if (legacySettings.context_budget && typeof legacySettings.context_budget === 'object') {
    contribution.context_budget = legacySettings.context_budget as { warning_threshold: number; critical_threshold: number; max_tokens: number };
  }

  // Store contribution and metadata
  settings._contributions[frameworkId] = contribution;
  settings._frameworks[frameworkId] = {
    version: frameworkVersion,
    installed_at: new Date().toISOString(),
  };

  // Recompute merged output
  remerge(settings);

  return settings;
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
  const flat: Record<string, unknown> = {};

  flat.hooks = JSON.parse(JSON.stringify(settings.hooks));
  flat.permissions = JSON.parse(JSON.stringify(settings.permissions));

  if (settings.statusLine) {
    flat.statusLine = JSON.parse(JSON.stringify(settings.statusLine));
  }

  if (settings.context_budget) {
    flat.context_budget = JSON.parse(JSON.stringify(settings.context_budget));
  }

  return flat;
}

/**
 * Validate a SharedSettings structure.
 */
export function validateSharedSettings(settings: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof settings !== 'object' || settings === null) {
    return { valid: false, errors: ['Settings must be a non-null object'] };
  }

  const s = settings as Record<string, unknown>;

  if (s._version === undefined) {
    errors.push('Missing _version field');
  } else if (s._version !== SHARED_SETTINGS_VERSION) {
    errors.push(`Invalid _version: expected ${SHARED_SETTINGS_VERSION}, got ${s._version}`);
  }

  if (s._frameworks === undefined || typeof s._frameworks !== 'object' || s._frameworks === null) {
    errors.push('Missing or invalid _frameworks field');
  }

  if (s._contributions === undefined || typeof s._contributions !== 'object' || s._contributions === null) {
    errors.push('Missing or invalid _contributions field');
  }

  if (s.hooks === undefined || typeof s.hooks !== 'object') {
    errors.push('Missing or invalid hooks field');
  }

  if (s.permissions === undefined || typeof s.permissions !== 'object') {
    errors.push('Missing or invalid permissions field');
  }

  return { valid: errors.length === 0, errors };
}
