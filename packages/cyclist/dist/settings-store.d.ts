/**
 * Settings Store for Cyclist
 *
 * Provides persistent storage for application settings including
 * the Bash approval gate feature (Story 22-3) and verbose mode (Story 22-5).
 *
 * Settings are stored in memory for the session with optional
 * file persistence for future enhancement.
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
//# sourceMappingURL=settings-store.d.ts.map