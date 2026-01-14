/**
 * Settings Store for Cyclist
 *
 * Provides persistent storage for application settings including
 * the Bash approval gate feature (Story 22-3), verbose mode (Story 22-5),
 * and permission grants (Story 33-4).
 *
 * Settings are stored in memory for the session with file persistence
 * for grants that should survive restart.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// =============================================================================
// Constants
// =============================================================================

const GRANTS_FILE = path.join(os.homedir(), '.cyclist', 'grants.json');

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
  display?: { show_flow?: boolean; show_ocean?: boolean; sidebar_width?: number };
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
}

// In-memory grant storage (session + once grants)
let sessionGrants: PermissionGrant[] = [];

// Persisted grants (always grants, stored in memory but synced to file)
let persistedGrants: PermissionGrant[] = [];

/**
 * Add a permission grant
 * @param grant - The grant to add
 */
export function addGrant(grant: PermissionGrant): void {
  if (grant.grant_type === 'always') {
    // Always grants go to persisted storage
    if (!persistedGrants.some((g) => g.tool === grant.tool && g.scope === grant.scope)) {
      persistedGrants.push(grant);
      // Persist to file immediately
      saveGrantsToFile();
    }
  } else {
    // Once and session grants go to session storage
    if (!sessionGrants.some((g) => g.tool === grant.tool && g.scope === grant.scope)) {
      sessionGrants.push(grant);
    }
  }
}

/**
 * Check if a grant exists for the given tool and command
 * Auto-revokes 'once' grants after checking
 * @param tool - The tool name (e.g., 'Bash', 'WebFetch')
 * @param command - The command/URL/path to check
 * @returns true if grant exists
 */
export function checkGrant(tool: string, command: string): boolean {
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

  // Check session grants first
  const sessionIndex = sessionGrants.findIndex(
    (g) => g.tool === tool && matchScope(g.scope, command)
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
    (g) => g.tool === tool && matchScope(g.scope, command)
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
  const hadPersistedGrant = persistedGrants.some(
    (g) => g.tool === grant.tool && g.scope === grant.scope && g.grant_type === grant.grant_type
  );

  sessionGrants = sessionGrants.filter(
    (g) => !(g.tool === grant.tool && g.scope === grant.scope && g.grant_type === grant.grant_type)
  );
  persistedGrants = persistedGrants.filter(
    (g) => !(g.tool === grant.tool && g.scope === grant.scope && g.grant_type === grant.grant_type)
  );

  // If we removed an always grant, update the file
  if (hadPersistedGrant && grant.grant_type === 'always') {
    saveGrantsToFile();
  }
}

/**
 * Clear all grants (both session and persisted)
 */
export function clearAllGrants(): void {
  const hadPersistedGrants = persistedGrants.length > 0;
  sessionGrants = [];
  persistedGrants = [];
  // Update file if we cleared any always grants
  if (hadPersistedGrants) {
    saveGrantsToFile();
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
    if (!persistedGrants.some((g) => g.tool === grant.tool && g.scope === grant.scope)) {
      persistedGrants.push(grant);
    }
    // Write to grants.json
    saveGrantsToFile();
  }
}

/**
 * Load persisted grants from settings file
 * Called on application startup
 */
export function loadPersistedGrants(): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(GRANTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read grants from file
    if (fs.existsSync(GRANTS_FILE)) {
      const content = fs.readFileSync(GRANTS_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data.grants)) {
        // Only load 'always' grants (session/once grants are not persisted)
        persistedGrants = data.grants.filter(
          (g: PermissionGrant) => g.grant_type === 'always'
        );
      }
    }
  } catch {
    // If file doesn't exist or is invalid, start with empty grants
    persistedGrants = [];
  }
}

/**
 * Save always grants to file
 * Internal helper for persistence
 */
function saveGrantsToFile(): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(GRANTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Only persist 'always' grants
    const data = {
      grants: persistedGrants.filter((g) => g.grant_type === 'always'),
    };

    fs.writeFileSync(GRANTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Silently fail on write errors - grants still work in memory
  }
}
