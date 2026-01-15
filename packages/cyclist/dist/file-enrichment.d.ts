/**
 * File Enrichment Module - Story 36-2, 36-3
 *
 * Enriches Read, Edit, and Bash tool spans with context metadata.
 * Builds on span-correlation foundation from Story 36-1.
 *
 * Features:
 * - File size and line count for Read spans
 * - Diff summary (lines added/removed) for Edit spans
 * - Language detection from file extension
 * - Git status integration (clean/modified/new/untracked)
 * - Bash: command (redacted), exit code, output summary, working directory
 */
/**
 * Diff summary for Edit operations
 */
export interface DiffSummary {
    /** Number of lines added */
    added: number;
    /** Number of lines removed */
    removed: number;
}
/**
 * Base enrichment result fields
 */
interface BaseEnrichment {
    /** Span ID that was enriched */
    spanId: string;
    /** Tool name (Read or Edit) */
    toolName: string;
    /** Detected language from file extension */
    language: string;
    /** Git status of the file */
    gitStatus: 'clean' | 'modified' | 'new' | 'untracked' | null;
    /** Whether enrichment was skipped (already enriched) */
    skipped?: boolean;
    /** Error message if enrichment failed */
    error?: string;
}
/**
 * Enrichment result for Read spans
 */
export interface FileEnrichment extends BaseEnrichment {
    toolName: 'Read';
    /** File size in bytes */
    fileSize?: number;
    /** Number of lines in file */
    lineCount?: number;
}
/**
 * Enrichment result for Edit spans
 */
export interface EditEnrichment extends BaseEnrichment {
    toolName: 'Edit';
    /** File size in bytes (of modified file) */
    fileSize?: number;
    /** Diff summary */
    diff: DiffSummary;
}
/**
 * Enrichment result for Write spans
 */
export interface WriteEnrichment extends BaseEnrichment {
    toolName: 'Write';
    /** File size in bytes (after write) */
    fileSize?: number;
    /** Number of lines written */
    lineCount?: number;
}
/**
 * Output summary for Bash commands
 */
export interface OutputSummary {
    /** First N lines of output */
    firstLines: string[];
    /** Last N lines of output (if truncated) */
    lastLines: string[];
    /** Total number of lines in output */
    totalLines: number;
    /** Whether output was truncated */
    truncated: boolean;
}
/**
 * Enrichment result for Bash spans
 */
export interface BashEnrichment {
    /** Span ID that was enriched */
    spanId: string;
    /** Tool name */
    toolName: 'Bash';
    /** Command executed (secrets redacted) */
    command: string;
    /** Exit code from command execution */
    exitCode: number | null;
    /** Output summary with first/last lines */
    outputSummary: OutputSummary;
    /** Working directory where command was executed */
    workingDirectory: string;
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Whether enrichment was skipped (already enriched) */
    skipped?: boolean;
    /** Error message if enrichment failed */
    error?: string;
}
/**
 * Union type for all enrichment results
 */
export type EnrichmentResult = FileEnrichment | EditEnrichment | WriteEnrichment | BashEnrichment;
/**
 * Detect programming language from file extension
 * @param filePath - Path to the file
 * @returns Language identifier or 'unknown'
 */
export declare function detectLanguage(filePath: string): string;
/**
 * Calculate diff summary between old and new content
 * Uses LCS-based diff to count actual lines added/removed
 * @param oldContent - Original content
 * @param newContent - New content
 * @returns Diff summary with added/removed counts
 */
export declare function calculateDiffSummary(oldContent: string, newContent: string): DiffSummary;
/**
 * Get file size in bytes
 * @param filePath - Path to the file
 * @returns File size in bytes
 */
export declare function getFileSize(filePath: string): Promise<number>;
/**
 * Get line count for a file
 * @param filePath - Path to the file
 * @returns Number of lines (0 for binary/empty files)
 */
export declare function getLineCount(filePath: string): Promise<number>;
/**
 * Get git status of a file
 * @param filePath - Path to the file
 * @returns Git status or null if not in a git repo
 */
export declare function getGitStatus(filePath: string): Promise<'clean' | 'modified' | 'new' | 'untracked' | null>;
/**
 * Redact secrets from a command string
 * @param command - The raw command string
 * @returns Command with secrets replaced by [REDACTED]
 */
export declare function redactSecrets(command: string): string;
/**
 * Create an output summary from command output
 * @param output - The full command output
 * @returns Summary with first/last lines and truncation info
 */
export declare function createOutputSummary(output: string | undefined): OutputSummary;
/**
 * Extract exit code from command output or error
 * Bash exit codes are in the output format or error message
 * @param output - Command output string
 * @param error - Error message if command failed
 * @param success - Whether command succeeded
 * @returns Exit code (0 for success, extracted code or 1 for failure)
 */
export declare function extractExitCode(output: string | undefined, error: string | undefined, success: boolean): number | null;
/**
 * Extract match count from search tool output
 * Counts non-empty lines in the output
 * @param output - Search tool output string
 * @returns Number of matches (lines)
 */
export declare function extractMatchCount(output: string | undefined): number;
/**
 * Extract unique file count from search output
 * Handles both grep content mode (filepath:line:content) and files_with_matches mode
 * @param output - Search tool output string
 * @returns Number of unique files
 */
export declare function extractFileCount(output: string | undefined): number;
/**
 * Extract list of files from search output
 * Returns unique file paths from grep/glob output
 * @param output - Search tool output string
 * @returns Array of unique file paths
 */
export declare function extractFileList(output: string | undefined): string[];
/**
 * Detect if search output was truncated
 * @param output - Search tool output string
 * @returns True if truncation indicators found
 */
export declare function detectTruncation(output: string | undefined): boolean;
/**
 * Enrich a Read span with file metadata
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with file metadata
 */
export declare function enrichReadSpan(spanId: string): Promise<FileEnrichment>;
/**
 * Enrich an Edit span with diff summary and file metadata
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with diff summary
 */
export declare function enrichEditSpan(spanId: string): Promise<EditEnrichment>;
/**
 * Enrich a Write span with file metadata
 * Write creates new files or overwrites existing, so we get metadata after the write
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with file metadata
 */
export declare function enrichWriteSpan(spanId: string): Promise<WriteEnrichment>;
/**
 * Context from OTEL event needed for Bash enrichment
 * This data is not in the correlation map but comes from the event
 */
export interface BashEventContext {
    /** Command output (may be truncated) */
    output?: string;
    /** Error message if command failed */
    error?: string;
    /** Whether command succeeded */
    success: boolean;
    /** Execution duration in milliseconds */
    durationMs?: number;
}
/**
 * Enrich a Bash span with command execution context
 * @param spanId - The span ID to enrich
 * @param eventContext - Additional context from OTEL event
 * @returns Enrichment result with command context
 */
export declare function enrichBashSpan(spanId: string, eventContext: BashEventContext): BashEnrichment;
export {};
//# sourceMappingURL=file-enrichment.d.ts.map