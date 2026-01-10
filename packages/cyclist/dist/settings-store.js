/**
 * Settings Store for Cyclist
 *
 * Provides persistent storage for application settings including
 * the Bash approval gate feature (Story 22-3) and verbose mode (Story 22-5).
 *
 * Settings are stored in memory for the session with optional
 * file persistence for future enhancement.
 */
// In-memory settings state
let bashApprovalGateEnabled = false;
let allowlist = [];
let verboseModeEnabled = false;
/**
 * Get the current state of the Bash approval gate
 * @returns true if approval gate is enabled, false otherwise
 */
export function getBashApprovalGate() {
    return bashApprovalGateEnabled;
}
/**
 * Set the state of the Bash approval gate
 * @param enabled - true to enable approval gate, false to disable
 */
export function setBashApprovalGate(enabled) {
    bashApprovalGateEnabled = enabled;
}
/**
 * Get all patterns in the allowlist
 * @returns Array of glob patterns
 */
export function getAllowlist() {
    return [...allowlist]; // Return copy to prevent mutation
}
/**
 * Add a pattern to the allowlist
 * Patterns use simple glob format: 'git *' matches 'git status', 'git commit', etc.
 * @param pattern - Glob pattern to add (e.g., 'git *', 'npm *')
 */
export function addToAllowlist(pattern) {
    if (!allowlist.includes(pattern)) {
        allowlist.push(pattern);
    }
}
/**
 * Check if a command matches any pattern in the allowlist
 * @param command - The full command to check
 * @returns true if command matches an allowlisted pattern
 */
export function isAllowlisted(command) {
    return allowlist.some((pattern) => matchGlobPattern(pattern, command));
}
/**
 * Clear all patterns from the allowlist
 */
export function clearAllowlist() {
    allowlist = [];
}
/**
 * Extract a glob pattern from a command
 * Takes the first word (command name) and appends ' *'
 * @param command - Full command string
 * @returns Glob pattern (e.g., 'git commit -m "msg"' -> 'git *')
 */
export function extractPattern(command) {
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
function matchGlobPattern(pattern, str) {
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
export function getVerboseMode() {
    return verboseModeEnabled;
}
/**
 * Set the state of verbose mode
 * @param enabled - true to enable verbose mode, false to disable
 */
export function setVerboseMode(enabled) {
    verboseModeEnabled = enabled;
}
//# sourceMappingURL=settings-store.js.map