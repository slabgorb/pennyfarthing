/**
 * E2-2: PTY Output Parser
 *
 * Parses Claude Code CLI output to extract stats (context, model, status).
 * Designed as a stateless utility module for use in the PTY data handler.
 */
/**
 * Parsed statistics from Claude output
 */
export interface ParsedStats {
    context?: string;
    model?: string;
    status?: string;
    mode?: string;
}
/**
 * Strip ANSI escape sequences from a string
 */
export declare function stripAnsi(input: string): string;
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
export declare function parseClaudeOutput(data: string): ParsedStats | null;
//# sourceMappingURL=parser.d.ts.map