/**
 * E2-2: PTY Output Parser
 *
 * Parses Claude Code CLI output to extract stats (context, model, status).
 * Designed as a stateless utility module for use in the PTY data handler.
 */
/**
 * ANSI escape sequence regex pattern
 * Matches all ANSI escape codes including:
 * - Color codes: \x1b[31m, \x1b[0m
 * - Cursor positioning: \x1b[2K, \x1b[1G
 * - Bold/underline: \x1b[1m, \x1b[4m
 * - Extended colors: \x1b[38;5;196m
 */
const ANSI_REGEX = /\x1b\[[0-9;]*[A-Za-z]/g;
/**
 * Strip ANSI escape sequences from a string
 */
export function stripAnsi(input) {
    if (typeof input !== 'string') {
        return '';
    }
    return input.replace(ANSI_REGEX, '');
}
/**
 * Pattern matchers for Claude output
 */
const PATTERNS = {
    // Context: 45.2% or Context: 100%
    context: /Context:\s*(\d+(?:\.\d+)?%)/i,
    // Model names: claude-sonnet-4, claude-opus-4-5, claude-haiku-3-5
    model: /\b(claude-(?:sonnet|opus|haiku)-[\d-]+)\b/i,
    // Status: Ready, Working, Streaming (with optional trailing dots/text)
    status: /\b(Ready|Working|Streaming)\.{0,3}\b/i,
    // Permission modes as displayed by Claude Code CLI (Shift+Tab cycles through)
    // Matches: "Normal", "Plan", "Auto-accept edits", "accept edits on", "plan mode on", etc.
    mode: /\b(Normal|Plan(?:\s+mode)?|Auto-accept\s+edits|accept\s+edits(?:\s+on)?)\b/i,
};
/**
 * Parse Claude output for statistics
 *
 * @param data - Raw PTY output data (may contain ANSI codes)
 * @returns ParsedStats object if any stats found, null otherwise
 *
 * Design notes:
 * - Never throws exceptions (returns null for invalid input)
 * - Strips ANSI codes before pattern matching
 * - Returns null for non-stat content (regular terminal output)
 * - Does not modify input data
 */
export function parseClaudeOutput(data) {
    // Handle invalid input types
    if (typeof data !== 'string') {
        return null;
    }
    // Handle empty or whitespace-only input
    const trimmed = data.trim();
    if (trimmed.length === 0) {
        return null;
    }
    // Strip ANSI codes for pattern matching
    const cleanData = stripAnsi(data);
    const result = {};
    let foundAny = false;
    // Extract context percentage
    const contextMatch = cleanData.match(PATTERNS.context);
    if (contextMatch) {
        result.context = contextMatch[1];
        foundAny = true;
    }
    // Extract model name
    const modelMatch = cleanData.match(PATTERNS.model);
    if (modelMatch) {
        let model = modelMatch[1].toLowerCase();
        // Strip "claude-" prefix for cleaner display
        model = model.replace(/^claude-/, '');
        // Strip datestamp suffix (e.g., -20251101)
        model = model.replace(/-\d{8}$/, '');
        result.model = model;
        foundAny = true;
    }
    // Extract status
    const statusMatch = cleanData.match(PATTERNS.status);
    if (statusMatch) {
        result.status = statusMatch[1].toLowerCase();
        foundAny = true;
    }
    // Extract permission mode and normalize to consistent values
    const modeMatch = cleanData.match(PATTERNS.mode);
    if (modeMatch) {
        const rawMode = modeMatch[1].toLowerCase();
        // Normalize to consistent mode names
        if (rawMode === 'normal') {
            result.mode = 'Normal';
        }
        else if (rawMode.includes('plan')) {
            result.mode = 'Plan';
        }
        else if (rawMode.includes('accept') || rawMode.includes('edits')) {
            result.mode = 'Auto-accept';
        }
        else {
            result.mode = modeMatch[1]; // Keep original if unknown
        }
        foundAny = true;
    }
    // Return null if no stats found (regular terminal output)
    return foundAny ? result : null;
}
//# sourceMappingURL=parser.js.map