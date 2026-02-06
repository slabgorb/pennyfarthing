/**
 * Settings Store for Cyclist
 *
 * Provides runtime state management for application settings including
 * the Bash approval gate feature (Story 22-3), verbose mode (Story 22-5),
 * and permission grants (Story 33-4).
 *
 * AC2 (35-14): This module handles ONLY runtime state - no file I/O.
 * File persistence is delegated to settings.ts via callbacks.
 */

// AC2: NO fs import - file I/O is handled by settings.ts

// =============================================================================
// In-Memory State
// =============================================================================

// In-memory settings state
let bashApprovalGateEnabled = false;
let allowlist: string[] = [];
let verboseModeEnabled = false;

/**
 * Get the current state of the Bash approval gate
 * @returns true if approval gate is enabled, false otherwise
 */
export function getBashApprovalGate(): boolean {
  return bashApprovalGateEnabled;
}

/**
 * Set the state of the Bash approval gate
 * @param enabled - true to enable approval gate, false to disable
 */
export function setBashApprovalGate(enabled: boolean): void {
  bashApprovalGateEnabled = enabled;
}

/**
 * Get all patterns in the allowlist
 * @returns Array of glob patterns
 */
export function getAllowlist(): string[] {
  return [...allowlist]; // Return copy to prevent mutation
}

/**
 * Add a pattern to the allowlist
 * Patterns use simple glob format: 'git *' matches 'git status', 'git commit', etc.
 * @param pattern - Glob pattern to add (e.g., 'git *', 'npm *')
 */
export function addToAllowlist(pattern: string): void {
  if (!allowlist.includes(pattern)) {
    allowlist.push(pattern);
  }
}

/**
 * Check if a command matches any pattern in the allowlist
 * @param command - The full command to check
 * @returns true if command matches an allowlisted pattern
 */
export function isAllowlisted(command: string): boolean {
  return allowlist.some((pattern) => matchGlobPattern(pattern, command));
}

/**
 * Clear all patterns from the allowlist
 */
export function clearAllowlist(): void {
  allowlist = [];
}

/**
 * Extract a glob pattern from a command
 * Takes the first word (command name) and appends ' *'
 * @param command - Full command string
 * @returns Glob pattern (e.g., 'git commit -m "msg"' -> 'git *')
 */
export function extractPattern(command: string): string {
  const firstWord = command.trim().split(/\s+/)[0];
  return `${firstWord} *`;
}

/**
 * Simple glob pattern matching
 * Supports '*' as wildcard for any characters
 * @param pattern - Glob pattern (e.g., 'git *')
 * @param str - String to match against
 * @returns true if str matches pattern
 */
function matchGlobPattern(pattern: string, str: string): boolean {
  // Escape regex special chars except *
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert * to regex .*
  const regexStr = escaped.replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(str);
}

// =============================================================================
// Verbose Mode (Story 22-5)
// =============================================================================

/**
 * Get the current state of verbose mode
 * When enabled, tool blocks are expanded by default
 * @returns true if verbose mode is enabled, false otherwise
 */
export function getVerboseMode(): boolean {
  return verboseModeEnabled;
}

/**
 * Set the state of verbose mode
 * @param enabled - true to enable verbose mode, false to disable
 */
export function setVerboseMode(enabled: boolean): void {
  verboseModeEnabled = enabled;
}

// =============================================================================
// Dangerous Path Detection (Story 22-4)
// =============================================================================

// In-memory state for dangerous path detection
let dangerousPathGateEnabled = true; // Enabled by default for safety
let pathAllowlist: string[] = [];

/**
 * Get the current state of the dangerous path gate
 * When enabled, modifications to sensitive paths require approval
 * @returns true if dangerous path gate is enabled, false otherwise
 */
export function getDangerousPathGate(): boolean {
  return dangerousPathGateEnabled;
}

/**
 * Set the state of the dangerous path gate
 * @param enabled - true to enable dangerous path detection, false to disable
 */
export function setDangerousPathGate(enabled: boolean): void {
  dangerousPathGateEnabled = enabled;
}

/**
 * Get all paths in the path allowlist
 * @returns Array of path patterns
 */
export function getPathAllowlist(): string[] {
  return [...pathAllowlist];
}

/**
 * Add a path to the allowlist
 * @param path - Path or glob pattern to allow
 */
export function addToPathAllowlist(path: string): void {
  if (!pathAllowlist.includes(path)) {
    pathAllowlist.push(path);
  }
}

/**
 * Check if a path matches any pattern in the path allowlist
 * @param path - The path to check
 * @returns true if path matches an allowlisted pattern
 */
export function isPathAllowlisted(path: string): boolean {
  return pathAllowlist.some((pattern) => matchPathPattern(pattern, path));
}

/**
 * Clear all paths from the path allowlist
 */
export function clearPathAllowlist(): void {
  pathAllowlist = [];
}

/**
 * Simple path pattern matching
 * Supports '*' as wildcard for any characters
 * @param pattern - Glob pattern
 * @param path - Path to match against
 * @returns true if path matches pattern
 */
function matchPathPattern(pattern: string, path: string): boolean {
  // Escape regex special chars except *
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert * to regex .*
  const regexStr = escaped.replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

// =============================================================================
// File-based Settings Integration (Story 24-1)
// =============================================================================

/**
 * Sync in-memory settings store with file-based settings
 * Called when file-based settings are loaded/changed to update runtime state
 * @param fileSettings - Settings loaded from file
 */
export function syncWithFileSettings(fileSettings: {
  workflow?: { auto_handoff?: boolean; handoff_confirm?: boolean };
  display?: { show_flow?: boolean; sidebar_width?: number };
  notifications?: { phase_change?: boolean; sound?: boolean };
}): void {
  // Future: could sync verbose mode or other settings from file
  // For now, just validate the settings structure
  if (fileSettings && typeof fileSettings === 'object') {
    // Settings are valid - integration point for future enhancements
    // E.g., could set verbose mode: setVerboseMode(fileSettings.display?.verbose ?? false);
  }
}

// =============================================================================
// Permission Grant System (Story 33-4)
// =============================================================================

/**
 * Grant type enum for permission scopes
 */
export const GrantType = {
  ONCE: 'once',
  SESSION: 'session',
  ALWAYS: 'always',
} as const;

export type GrantTypeValue = (typeof GrantType)[keyof typeof GrantType];

/**
 * Permission grant structure
 */
export interface PermissionGrant {
  tool: string;
  scope: string;
  grant_type: GrantTypeValue;
  granted_at: string;
  agent?: string;
}

// In-memory grant storage (session + once grants)
let sessionGrants: PermissionGrant[] = [];

// Persisted grants (always grants, stored in memory but synced to file via callback)
let persistedGrants: PermissionGrant[] = [];

// AC2: Callback for persisting grants to file (delegated to settings.ts)
let grantsPersistCallback: ((grants: PermissionGrant[]) => boolean) | null = null;

/**
 * Set the callback for persisting grants to file
 * AC2: Delegates persistence to settings.ts
 * @param callback - Function that persists grants and returns success boolean
 */
export function setGrantsPersistCallback(callback: (grants: PermissionGrant[]) => boolean): void {
  grantsPersistCallback = callback;
}

/**
 * Initialize grants from pre-loaded data
 * AC2: Accepts grants array from settings.ts instead of reading files directly
 * @param grants - Array of grants to initialize with
 */
export function initializeGrants(grants: PermissionGrant[]): void {
  // Clear existing grants
  persistedGrants = [];

  // Only load 'always' grants (session/once grants are not persisted)
  for (const grant of grants) {
    if (grant.grant_type === 'always') {
      persistedGrants.push(grant);
    }
  }
}

/**
 * Add a permission grant
 * @param grant - The grant to add
 */
export function addGrant(grant: PermissionGrant): void {
  if (grant.grant_type === 'always') {
    // Always grants go to persisted storage
    if (!persistedGrants.some((g) => g.tool === grant.tool && g.scope === grant.scope && g.agent === grant.agent)) {
      persistedGrants.push(grant);
      // AC2: Persist via callback instead of direct file I/O
      if (grantsPersistCallback) {
        grantsPersistCallback(persistedGrants);
      }
    }
  } else {
    // Once and session grants go to session storage
    if (!sessionGrants.some((g) => g.tool === grant.tool && g.scope === grant.scope && g.agent === grant.agent)) {
      sessionGrants.push(grant);
    }
  }
}

/**
 * Check if a grant exists for the given tool and command
 * Auto-revokes 'once' grants after checking
 * @param tool - The tool name (e.g., 'Bash', 'WebFetch')
 * @param command - The command/URL/path to check
 * @param agent - Optional agent name for agent-scoped grant matching
 * @returns true if grant exists
 */
export function checkGrant(tool: string, command: string, agent?: string): boolean {
  // Use appropriate matching based on tool type
  const matchScope = (scope: string, value: string) => {
    // For WebFetch, use domain matching for URLs
    if (tool === 'WebFetch' && (value.startsWith('http://') || value.startsWith('https://'))) {
      return matchDomainPattern(scope, value);
    }
    // For file tools, use path matching
    if ((tool === 'Edit' || tool === 'Write' || tool === 'Read') && value.startsWith('/')) {
      return matchPathPattern(scope, value);
    }
    // Default: glob pattern matching
    return matchGlobPattern(scope, value);
  };

  // Match agent: global grants (no agent) match any request,
  // agent-scoped grants only match when the requesting agent matches
  const matchAgent = (grant: PermissionGrant) => {
    if (!grant.agent) return true; // Global grant matches any agent
    return grant.agent === agent; // Agent-scoped grant requires match
  };

  // Check session grants first
  const sessionIndex = sessionGrants.findIndex(
    (g) => g.tool === tool && matchScope(g.scope, command) && matchAgent(g)
  );

  if (sessionIndex !== -1) {
    const grant = sessionGrants[sessionIndex];
    if (grant.grant_type === 'once') {
      // Auto-revoke once grants
      sessionGrants.splice(sessionIndex, 1);
    }
    return true;
  }

  // Check persisted grants
  const persistedMatch = persistedGrants.find(
    (g) => g.tool === tool && matchScope(g.scope, command) && matchAgent(g)
  );

  return !!persistedMatch;
}

/**
 * Match a domain pattern against a URL (Story 33-3)
 * Supports patterns like '*.github.com' to match 'github.com', 'api.github.com', etc.
 * @param pattern - Domain pattern (e.g., '*.github.com')
 * @param url - URL to match against
 * @returns true if URL matches pattern
 */
function matchDomainPattern(pattern: string, url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // If pattern starts with '*.' it matches the domain and all subdomains
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2); // Remove '*.'
      return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
    }

    // Exact domain match
    return hostname === pattern;
  } catch {
    // Invalid URL, fall back to glob matching
    return matchGlobPattern(pattern, url);
  }
}

/**
 * Get all grants (session + persisted)
 * @returns Array of all grants
 */
export function getGrants(): PermissionGrant[] {
  return [...sessionGrants, ...persistedGrants];
}

/**
 * Get only session grants (memory-only, non-persisted)
 * @returns Array of session grants
 */
export function getSessionGrants(): PermissionGrant[] {
  return [...sessionGrants];
}

/**
 * Get only persisted grants (always grants)
 * @returns Array of persisted grants
 */
export function getPersistedGrants(): PermissionGrant[] {
  return [...persistedGrants];
}

/**
 * Remove a specific grant
 * @param grant - The grant to remove
 */
export function removeGrant(grant: PermissionGrant): void {
  const matchGrant = (g: PermissionGrant) =>
    g.tool === grant.tool && g.scope === grant.scope && g.grant_type === grant.grant_type && g.agent === grant.agent;

  const hadPersistedGrant = persistedGrants.some(matchGrant);

  sessionGrants = sessionGrants.filter((g) => !matchGrant(g));
  persistedGrants = persistedGrants.filter((g) => !matchGrant(g));

  // AC2: If we removed an always grant, persist via callback
  if (hadPersistedGrant && grant.grant_type === 'always' && grantsPersistCallback) {
    grantsPersistCallback(persistedGrants);
  }
}

/**
 * Clear all grants (both session and persisted)
 */
export function clearAllGrants(): void {
  const hadPersistedGrants = persistedGrants.length > 0;
  sessionGrants = [];
  persistedGrants = [];
  // AC2: Persist via callback if we cleared any always grants
  if (hadPersistedGrants && grantsPersistCallback) {
    grantsPersistCallback(persistedGrants);
  }
}

/**
 * Clear session grants only (once + session, not always)
 * Called on application exit
 */
export function clearSessionGrants(): void {
  sessionGrants = [];
}

/**
 * Persist an always grant to settings file
 * @param grant - The grant to persist
 */
export function persistAlwaysGrant(grant: PermissionGrant): void {
  if (grant.grant_type === 'always') {
    if (!persistedGrants.some((g) => g.tool === grant.tool && g.scope === grant.scope && g.agent === grant.agent)) {
      persistedGrants.push(grant);
    }
    // AC2: Persist via callback
    if (grantsPersistCallback) {
      grantsPersistCallback(persistedGrants);
    }
  }
}

/**
 * Load persisted grants from settings file
 * DEPRECATED: Use initializeGrants() with grants from settings.loadGrants() instead
 * Kept for backward compatibility - calls initializeGrants with empty array
 */
export function loadPersistedGrants(): void {
  // AC2: This function no longer does file I/O
  // For backward compatibility, initialize with empty grants
  // Callers should use: settingsStore.initializeGrants(settings.loadGrants())
  initializeGrants([]);
}
