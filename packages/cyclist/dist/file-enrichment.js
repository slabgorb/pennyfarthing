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
import { stat, readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { extname, dirname } from 'path';
import { getCorrelation, correlateSpan, } from './span-correlation.js';
const execAsync = promisify(exec);
// =============================================================================
// Language Detection
// =============================================================================
/**
 * Map of file extensions to language identifiers
 */
const extensionLanguageMap = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.zsh': 'shellscript',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.toml': 'toml',
    '.xml': 'xml',
    '.csv': 'csv',
};
/**
 * Detect programming language from file extension
 * @param filePath - Path to the file
 * @returns Language identifier or 'unknown'
 */
export function detectLanguage(filePath) {
    const ext = extname(filePath).toLowerCase();
    return extensionLanguageMap[ext] || 'unknown';
}
// =============================================================================
// Diff Calculation
// =============================================================================
/**
 * Calculate diff summary between old and new content
 * Uses LCS-based diff to count actual lines added/removed
 * @param oldContent - Original content
 * @param newContent - New content
 * @returns Diff summary with added/removed counts
 */
export function calculateDiffSummary(oldContent, newContent) {
    if (oldContent === newContent) {
        return { added: 0, removed: 0 };
    }
    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent ? newContent.split('\n') : [];
    // Build set of lines for O(n) lookup
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    // Lines in new but not in old = added
    let added = 0;
    for (const line of newLines) {
        if (!oldSet.has(line)) {
            added++;
        }
    }
    // Lines in old but not in new = removed
    let removed = 0;
    for (const line of oldLines) {
        if (!newSet.has(line)) {
            removed++;
        }
    }
    return { added, removed };
}
// =============================================================================
// File Utilities
// =============================================================================
/**
 * Get file size in bytes
 * @param filePath - Path to the file
 * @returns File size in bytes
 */
export async function getFileSize(filePath) {
    try {
        const stats = await stat(filePath);
        return stats.size;
    }
    catch {
        return 0;
    }
}
/**
 * Get line count for a file
 * @param filePath - Path to the file
 * @returns Number of lines (0 for binary/empty files)
 */
export async function getLineCount(filePath) {
    try {
        const content = await readFile(filePath, 'utf-8');
        if (!content)
            return 0;
        // Check for binary content (null bytes indicate binary)
        if (content.includes('\0'))
            return 0;
        return content.split('\n').length;
    }
    catch {
        return 0;
    }
}
/**
 * Get git status of a file
 * @param filePath - Path to the file
 * @returns Git status or null if not in a git repo
 */
export async function getGitStatus(filePath) {
    try {
        const dir = dirname(filePath);
        // Check if in a git repo
        try {
            await execAsync('git rev-parse --git-dir', { cwd: dir });
        }
        catch {
            return null;
        }
        // Get status of the specific file
        const { stdout } = await execAsync(`git status --porcelain "${filePath}"`, { cwd: dir });
        const status = stdout.trim();
        if (!status) {
            // No output means file is tracked and clean
            return 'clean';
        }
        // Parse git status codes
        const code = status.substring(0, 2);
        if (code.includes('?')) {
            return 'untracked';
        }
        if (code.includes('A') || code === 'AM') {
            return 'new';
        }
        if (code.includes('M') || code.includes('U') || code.includes('D')) {
            return 'modified';
        }
        return 'clean';
    }
    catch {
        return null;
    }
}
// =============================================================================
// Span Enrichment Functions
// =============================================================================
/**
 * Mark a span as enriched in the correlation map
 */
function markSpanEnriched(spanId) {
    const correlation = getCorrelation(spanId);
    if (correlation) {
        correlateSpan(spanId, { ...correlation, enriched: true });
    }
}
/**
 * Extract file path from span's message context
 */
function getFilePathFromSpan(correlation) {
    const input = correlation.messageContext?.input;
    if (!input)
        return null;
    return input.file_path || null;
}
/**
 * Enrich a Read span with file metadata
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with file metadata
 */
export async function enrichReadSpan(spanId) {
    const correlation = getCorrelation(spanId);
    // Handle non-existent span
    if (!correlation) {
        return {
            spanId,
            toolName: 'Read',
            language: 'unknown',
            gitStatus: null,
            error: 'Span not found',
        };
    }
    // Skip if already enriched
    if (correlation.enriched) {
        return {
            spanId,
            toolName: 'Read',
            language: 'unknown',
            gitStatus: null,
            skipped: true,
        };
    }
    // Check for message context
    if (!correlation.messageContext) {
        return {
            spanId,
            toolName: 'Read',
            language: 'unknown',
            gitStatus: null,
            error: 'No message context available',
        };
    }
    // Get file path
    const filePath = getFilePathFromSpan(correlation);
    if (!filePath) {
        return {
            spanId,
            toolName: 'Read',
            language: 'unknown',
            gitStatus: null,
            error: 'No file path in input',
        };
    }
    // Gather file metadata
    const [fileSize, lineCount, gitStatus] = await Promise.all([
        getFileSize(filePath),
        getLineCount(filePath),
        getGitStatus(filePath),
    ]);
    const language = detectLanguage(filePath);
    // Check if file exists (size 0 and lineCount 0 could mean missing file)
    let error;
    try {
        await stat(filePath);
    }
    catch {
        error = 'File not found';
    }
    // Mark as enriched
    markSpanEnriched(spanId);
    if (error) {
        return {
            spanId,
            toolName: 'Read',
            language,
            gitStatus,
            error,
        };
    }
    return {
        spanId,
        toolName: 'Read',
        fileSize,
        lineCount,
        language,
        gitStatus,
    };
}
/**
 * Enrich an Edit span with diff summary and file metadata
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with diff summary
 */
export async function enrichEditSpan(spanId) {
    const correlation = getCorrelation(spanId);
    // Handle non-existent span
    if (!correlation) {
        return {
            spanId,
            toolName: 'Edit',
            language: 'unknown',
            gitStatus: null,
            diff: { added: 0, removed: 0 },
            error: 'Span not found',
        };
    }
    // Skip if already enriched
    if (correlation.enriched) {
        return {
            spanId,
            toolName: 'Edit',
            language: 'unknown',
            gitStatus: null,
            diff: { added: 0, removed: 0 },
            skipped: true,
        };
    }
    // Check for message context
    if (!correlation.messageContext) {
        return {
            spanId,
            toolName: 'Edit',
            language: 'unknown',
            gitStatus: null,
            diff: { added: 0, removed: 0 },
            error: 'No message context available',
        };
    }
    const input = correlation.messageContext.input || {};
    const filePath = input.file_path || null;
    const oldString = input.old_string || '';
    const newString = input.new_string || '';
    if (!filePath) {
        return {
            spanId,
            toolName: 'Edit',
            language: 'unknown',
            gitStatus: null,
            diff: { added: 0, removed: 0 },
            error: 'No file path in input',
        };
    }
    // Calculate diff
    const diff = calculateDiffSummary(oldString, newString);
    // Get file metadata
    const [fileSize, gitStatus] = await Promise.all([
        getFileSize(filePath),
        getGitStatus(filePath),
    ]);
    const language = detectLanguage(filePath);
    // Mark as enriched
    markSpanEnriched(spanId);
    return {
        spanId,
        toolName: 'Edit',
        fileSize,
        language,
        gitStatus,
        diff,
    };
}
//# sourceMappingURL=file-enrichment.js.map