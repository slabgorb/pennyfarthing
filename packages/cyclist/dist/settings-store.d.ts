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
/**
 * Get the current state of the Bash approval gate
 * @returns true if approval gate is enabled, false otherwise
 */
export declare function getBashApprovalGate(): boolean;
/**
 * Set the state of the Bash approval gate
 * @param enabled - true to enable approval gate, false to disable
 */
export declare function setBashApprovalGate(enabled: boolean): void;
/**
 * Get all patterns in the allowlist
 * @returns Array of glob patterns
 */
export declare function getAllowlist(): string[];
/**
 * Add a pattern to the allowlist
 * Patterns use simple glob format: 'git *' matches 'git status', 'git commit', etc.
 * @param pattern - Glob pattern to add (e.g., 'git *', 'npm *')
 */
export declare function addToAllowlist(pattern: string): void;
/**
 * Check if a command matches any pattern in the allowlist
 * @param command - The full command to check
 * @returns true if command matches an allowlisted pattern
 */
export declare function isAllowlisted(command: string): boolean;
/**
 * Clear all patterns from the allowlist
 */
export declare function clearAllowlist(): void;
/**
 * Extract a glob pattern from a command
 * Takes the first word (command name) and appends ' *'
 * @param command - Full command string
 * @returns Glob pattern (e.g., 'git commit -m "msg"' -> 'git *')
 */
export declare function extractPattern(command: string): string;
/**
 * Get the current state of verbose mode
 * When enabled, tool blocks are expanded by default
 * @returns true if verbose mode is enabled, false otherwise
 */
export declare function getVerboseMode(): boolean;
/**
 * Set the state of verbose mode
 * @param enabled - true to enable verbose mode, false to disable
 */
export declare function setVerboseMode(enabled: boolean): void;
/**
 * Get the current state of the dangerous path gate
 * When enabled, modifications to sensitive paths require approval
 * @returns true if dangerous path gate is enabled, false otherwise
 */
export declare function getDangerousPathGate(): boolean;
/**
 * Set the state of the dangerous path gate
 * @param enabled - true to enable dangerous path detection, false to disable
 */
export declare function setDangerousPathGate(enabled: boolean): void;
/**
 * Get all paths in the path allowlist
 * @returns Array of path patterns
 */
export declare function getPathAllowlist(): string[];
/**
 * Add a path to the allowlist
 * @param path - Path or glob pattern to allow
 */
export declare function addToPathAllowlist(path: string): void;
/**
 * Check if a path matches any pattern in the path allowlist
 * @param path - The path to check
 * @returns true if path matches an allowlisted pattern
 */
export declare function isPathAllowlisted(path: string): boolean;
/**
 * Clear all paths from the path allowlist
 */
export declare function clearPathAllowlist(): void;
/**
 * Sync in-memory settings store with file-based settings
 * Called when file-based settings are loaded/changed to update runtime state
 * @param fileSettings - Settings loaded from file
 */
export declare function syncWithFileSettings(fileSettings: {
    workflow?: {
        auto_handoff?: boolean;
        handoff_confirm?: boolean;
    };
    display?: {
        show_flow?: boolean;
        show_ocean?: boolean;
        sidebar_width?: number;
    };
    notifications?: {
        phase_change?: boolean;
        sound?: boolean;
    };
}): void;
/**
 * Grant type enum for permission scopes
 */
export declare const GrantType: {
    readonly ONCE: "once";
    readonly SESSION: "session";
    readonly ALWAYS: "always";
};
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
/**
 * Set the callback for persisting grants to file
 * AC2: Delegates persistence to settings.ts
 * @param callback - Function that persists grants and returns success boolean
 */
export declare function setGrantsPersistCallback(callback: (grants: PermissionGrant[]) => boolean): void;
/**
 * Initialize grants from pre-loaded data
 * AC2: Accepts grants array from settings.ts instead of reading files directly
 * @param grants - Array of grants to initialize with
 */
export declare function initializeGrants(grants: PermissionGrant[]): void;
/**
 * Add a permission grant
 * @param grant - The grant to add
 */
export declare function addGrant(grant: PermissionGrant): void;
/**
 * Check if a grant exists for the given tool and command
 * Auto-revokes 'once' grants after checking
 * @param tool - The tool name (e.g., 'Bash', 'WebFetch')
 * @param command - The command/URL/path to check
 * @returns true if grant exists
 */
export declare function checkGrant(tool: string, command: string): boolean;
/**
 * Get all grants (session + persisted)
 * @returns Array of all grants
 */
export declare function getGrants(): PermissionGrant[];
/**
 * Get only session grants (memory-only, non-persisted)
 * @returns Array of session grants
 */
export declare function getSessionGrants(): PermissionGrant[];
/**
 * Get only persisted grants (always grants)
 * @returns Array of persisted grants
 */
export declare function getPersistedGrants(): PermissionGrant[];
/**
 * Remove a specific grant
 * @param grant - The grant to remove
 */
export declare function removeGrant(grant: PermissionGrant): void;
/**
 * Clear all grants (both session and persisted)
 */
export declare function clearAllGrants(): void;
/**
 * Clear session grants only (once + session, not always)
 * Called on application exit
 */
export declare function clearSessionGrants(): void;
/**
 * Persist an always grant to settings file
 * @param grant - The grant to persist
 */
export declare function persistAlwaysGrant(grant: PermissionGrant): void;
/**
 * Load persisted grants from settings file
 * DEPRECATED: Use initializeGrants() with grants from settings.loadGrants() instead
 * Kept for backward compatibility - calls initializeGrants with empty array
 */
export declare function loadPersistedGrants(): void;
//# sourceMappingURL=settings-store.d.ts.map