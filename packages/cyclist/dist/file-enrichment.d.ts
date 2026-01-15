/**
 * File Enrichment Module - Story 36-2
 *
 * Enriches Read and Edit tool spans with file context metadata.
 * Builds on span-correlation foundation from Story 36-1.
 *
 * Features:
 * - File size and line count for Read spans
 * - Diff summary (lines added/removed) for Edit spans
 * - Language detection from file extension
 * - Git status integration (clean/modified/new/untracked)
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
 * Union type for all enrichment results
 */
export type EnrichmentResult = FileEnrichment | EditEnrichment;
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
export {};
//# sourceMappingURL=file-enrichment.d.ts.map