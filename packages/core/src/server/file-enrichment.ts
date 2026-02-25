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

import { stat, readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { extname, dirname } from 'path';
import {
  getCorrelation,
  correlateSpan,
  type SpanCorrelation,
} from './span-correlation.js';

const execAsync = promisify(exec);

// =============================================================================
// Type Definitions
// =============================================================================

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

// =============================================================================
// Bash Enrichment Types (Story 36-3)
// =============================================================================

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

// =============================================================================
// Task Enrichment Types (Story 36-4 / MSSCI-11733)
// =============================================================================

/**
 * Context from OTEL event needed for Task enrichment
 * This data is not in the correlation map but comes from the event
 */
export interface TaskEventContext {
  /** Task result/output when complete */
  result?: string;
  /** Error message if task failed */
  error?: string;
  /** Whether task succeeded */
  success: boolean;
  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Enrichment result for Task/subagent spans
 */
export interface TaskEnrichment {
  /** Span ID that was enriched */
  spanId: string;
  /** Tool name */
  toolName: 'Task';
  /** Subagent type (general-purpose, Bash, Explore, Plan) */
  subagentType: string;
  /** Summary of prompt (first 200 chars) */
  promptSummary: string;
  /** Summary of result (first 500 chars) */
  resultSummary: string;
  /** Whether task ran in background */
  background: boolean;
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
export type EnrichmentResult = FileEnrichment | EditEnrichment | WriteEnrichment | BashEnrichment | TaskEnrichment;

// =============================================================================
// Language Detection
// =============================================================================

/**
 * Map of file extensions to language identifiers
 */
const extensionLanguageMap: Record<string, string> = {
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
export function detectLanguage(filePath: string): string {
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
export function calculateDiffSummary(oldContent: string, newContent: string): DiffSummary {
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
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Get line count for a file
 * @param filePath - Path to the file
 * @returns Number of lines (0 for binary/empty files)
 */
export async function getLineCount(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf-8');
    if (!content) return 0;
    // Check for binary content (null bytes indicate binary)
    if (content.includes('\0')) return 0;
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * Get git status of a file
 * @param filePath - Path to the file
 * @returns Git status or null if not in a git repo
 */
export async function getGitStatus(
  filePath: string
): Promise<'clean' | 'modified' | 'new' | 'untracked' | null> {
  try {
    const dir = dirname(filePath);

    // Check if in a git repo
    try {
      await execAsync('git rev-parse --git-dir', { cwd: dir });
    } catch {
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
  } catch {
    return null;
  }
}

// =============================================================================
// Text Summarization (Story 36-4 / MSSCI-11733)
// =============================================================================

/**
 * Summarize text by truncating to max length with ellipsis
 * Also collapses newlines to spaces for single-line summaries
 * @param text - The text to summarize
 * @param maxLength - Maximum length before truncation
 * @returns Summarized text, possibly truncated with '...'
 */
export function summarizeText(text: string, maxLength: number): string {
  if (!text) return '';

  // Collapse newlines to spaces for single-line summary
  const collapsed = text.replace(/\n/g, ' ');

  // If under limit, return as-is
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  // Truncate and add ellipsis
  return collapsed.slice(0, maxLength) + '...';
}

// =============================================================================
// Bash Utilities (Story 36-3)
// =============================================================================

/**
 * Patterns that indicate sensitive data in commands
 * Each pattern is a regex that matches the sensitive portion
 */
const SECRET_PATTERNS: RegExp[] = [
  // Key-value patterns (password=xxx, token=xxx, etc.)
  /\b(password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?token|access[_-]?token|bearer|credential|private[_-]?key)\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
  // AWS credentials
  /\b(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*=\s*['"]?[^\s'"]+['"]?/gi,
  // Base64 encoded strings (likely tokens) - 40+ chars
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
  // GitHub tokens
  /\b(gh[pousr]_[A-Za-z0-9_]{36,})\b/g,
  // Generic API keys (long hex or alphanumeric strings after key/token keywords)
  /\b(key|token|secret)\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
];

/**
 * Redact secrets from a command string
 * @param command - The raw command string
 * @returns Command with secrets replaced by [REDACTED]
 */
export function redactSecrets(command: string): string {
  if (!command) return '';

  let redacted = command;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      // For key=value patterns, preserve the key name
      const keyMatch = match.match(/^(\w+)\s*[=:]/);
      if (keyMatch) {
        return `${keyMatch[1]}=[REDACTED]`;
      }
      return '[REDACTED]';
    });
  }

  return redacted;
}

/** Number of lines to show at start of output */
const OUTPUT_HEAD_LINES = 5;
/** Number of lines to show at end of output */
const OUTPUT_TAIL_LINES = 5;

/**
 * Create an output summary from command output
 * @param output - The full command output
 * @returns Summary with first/last lines and truncation info
 */
export function createOutputSummary(output: string | undefined): OutputSummary {
  if (output === undefined) {
    return {
      firstLines: [],
      lastLines: [],
      totalLines: 0,
      truncated: false,
    };
  }

  const lines = output.split('\n');
  const totalLines = lines.length;

  // If output fits within head + tail, no truncation needed
  if (totalLines <= OUTPUT_HEAD_LINES + OUTPUT_TAIL_LINES) {
    return {
      firstLines: lines,
      lastLines: [],
      totalLines,
      truncated: false,
    };
  }

  // Truncated output: show first N and last N lines
  return {
    firstLines: lines.slice(0, OUTPUT_HEAD_LINES),
    lastLines: lines.slice(-OUTPUT_TAIL_LINES),
    totalLines,
    truncated: true,
  };
}

/**
 * Extract exit code from command output or error
 * Bash exit codes are in the output format or error message
 * @param output - Command output string
 * @param error - Error message if command failed
 * @param success - Whether command succeeded
 * @returns Exit code (0 for success, extracted code or 1 for failure)
 */
export function extractExitCode(
  output: string | undefined,
  error: string | undefined,
  success: boolean
): number | null {
  // Success means exit code 0
  if (success) return 0;

  // Try to extract exit code from error message
  // Common pattern: "Exit code N" or "exit code: N" or "exited with N"
  if (error) {
    const exitMatch = error.match(/exit(?:ed)?(?:\s+(?:code|with))?\s*[:\s]?\s*(\d+)/i);
    if (exitMatch) {
      return parseInt(exitMatch[1], 10);
    }
  }

  // Default to 1 for failure without specific code
  return 1;
}

// =============================================================================
// Search Enrichment Utilities (Story 36-4)
// =============================================================================

/**
 * Extract match count from search tool output
 * Counts non-empty lines in the output
 * @param output - Search tool output string
 * @returns Number of matches (lines)
 */
export function extractMatchCount(output: string | undefined): number {
  if (!output) return 0;

  const lines = output.split('\n').filter((line) => line.trim() !== '');
  return lines.length;
}

/**
 * Extract file path from a grep content line
 * Handles format: filepath:line:content
 * @param line - Line from grep output
 * @returns File path or the whole line if no colon pattern
 */
function extractFilePathFromLine(line: string): string {
  // Grep content mode: filepath:line:content
  // Need to handle paths that may contain colons (e.g., Windows paths)
  // Pattern: split on : and take first part, but validate it looks like a path
  const colonIndex = line.indexOf(':');
  if (colonIndex > 0) {
    const potential = line.substring(0, colonIndex);
    // Check if what follows the first colon is a number (line number)
    const afterColon = line.substring(colonIndex + 1);
    const lineNumMatch = afterColon.match(/^(\d+):/);
    if (lineNumMatch) {
      // This is filepath:linenum:content format
      return potential;
    }
  }
  // No colon or not in expected format - return whole line (files_with_matches mode)
  return line.trim();
}

/**
 * Extract unique file count from search output
 * Handles both grep content mode (filepath:line:content) and files_with_matches mode
 * @param output - Search tool output string
 * @returns Number of unique files
 */
export function extractFileCount(output: string | undefined): number {
  if (!output) return 0;

  const lines = output.split('\n').filter((line) => line.trim() !== '');
  const uniqueFiles = new Set<string>();

  for (const line of lines) {
    const filePath = extractFilePathFromLine(line);
    if (filePath) {
      uniqueFiles.add(filePath);
    }
  }

  return uniqueFiles.size;
}

/**
 * Extract list of files from search output
 * Returns unique file paths from grep/glob output
 * @param output - Search tool output string
 * @returns Array of unique file paths
 */
export function extractFileList(output: string | undefined): string[] {
  if (!output) return [];

  const lines = output.split('\n').filter((line) => line.trim() !== '');
  const uniqueFiles = new Set<string>();

  for (const line of lines) {
    const filePath = extractFilePathFromLine(line);
    if (filePath) {
      uniqueFiles.add(filePath);
    }
  }

  return Array.from(uniqueFiles);
}

/**
 * Patterns indicating output was truncated
 */
const TRUNCATION_PATTERNS: RegExp[] = [
  /truncated/i,
  /output too large/i,
  /\[\d+ more results? not shown\]/i,
  /first \d+ lines shown/i,
  /results? limited/i,
];

/**
 * Detect if search output was truncated
 * @param output - Search tool output string
 * @returns True if truncation indicators found
 */
export function detectTruncation(output: string | undefined): boolean {
  if (!output) return false;

  for (const pattern of TRUNCATION_PATTERNS) {
    if (pattern.test(output)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Span Enrichment Functions
// =============================================================================

/**
 * Mark a span as enriched in the correlation map
 */
function markSpanEnriched(spanId: string): void {
  const correlation = getCorrelation(spanId);
  if (correlation) {
    correlateSpan(spanId, { ...correlation, enriched: true });
  }
}

/**
 * Extract file path from span's message context
 */
function getFilePathFromSpan(correlation: SpanCorrelation): string | null {
  const input = correlation.messageContext?.input;
  if (!input) return null;
  return (input.file_path as string) || null;
}

/**
 * Enrich a Read span with file metadata
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with file metadata
 */
export async function enrichReadSpan(spanId: string): Promise<FileEnrichment> {
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
  let error: string | undefined;
  try {
    await stat(filePath);
  } catch {
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
export async function enrichEditSpan(spanId: string): Promise<EditEnrichment> {
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
  const filePath = (input.file_path as string) || null;
  const oldString = (input.old_string as string) || '';
  const newString = (input.new_string as string) || '';

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

/**
 * Enrich a Write span with file metadata
 * Write creates new files or overwrites existing, so we get metadata after the write
 * @param spanId - The span ID to enrich
 * @returns Enrichment result with file metadata
 */
export async function enrichWriteSpan(spanId: string): Promise<WriteEnrichment> {
  const correlation = getCorrelation(spanId);

  // Handle non-existent span
  if (!correlation) {
    return {
      spanId,
      toolName: 'Write',
      language: 'unknown',
      gitStatus: null,
      error: 'Span not found',
    };
  }

  // Skip if already enriched
  if (correlation.enriched) {
    return {
      spanId,
      toolName: 'Write',
      language: 'unknown',
      gitStatus: null,
      skipped: true,
    };
  }

  // Check for message context
  if (!correlation.messageContext) {
    return {
      spanId,
      toolName: 'Write',
      language: 'unknown',
      gitStatus: null,
      error: 'No message context available',
    };
  }

  // Get file path from input
  const filePath = getFilePathFromSpan(correlation);
  if (!filePath) {
    return {
      spanId,
      toolName: 'Write',
      language: 'unknown',
      gitStatus: null,
      error: 'No file path in input',
    };
  }

  // Gather file metadata (after write has completed)
  const [fileSize, lineCount, gitStatus] = await Promise.all([
    getFileSize(filePath),
    getLineCount(filePath),
    getGitStatus(filePath),
  ]);

  const language = detectLanguage(filePath);

  // Mark as enriched
  markSpanEnriched(spanId);

  return {
    spanId,
    toolName: 'Write',
    fileSize,
    lineCount,
    language,
    gitStatus,
  };
}

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
export function enrichBashSpan(
  spanId: string,
  eventContext: BashEventContext
): BashEnrichment {
  const correlation = getCorrelation(spanId);

  // Handle non-existent span
  if (!correlation) {
    return {
      spanId,
      toolName: 'Bash',
      command: '',
      exitCode: null,
      outputSummary: { firstLines: [], lastLines: [], totalLines: 0, truncated: false },
      workingDirectory: '',
      durationMs: 0,
      error: 'Span not found',
    };
  }

  // Skip if already enriched
  if (correlation.enriched) {
    return {
      spanId,
      toolName: 'Bash',
      command: '',
      exitCode: null,
      outputSummary: { firstLines: [], lastLines: [], totalLines: 0, truncated: false },
      workingDirectory: '',
      durationMs: 0,
      skipped: true,
    };
  }

  // Check for message context
  if (!correlation.messageContext) {
    return {
      spanId,
      toolName: 'Bash',
      command: '',
      exitCode: null,
      outputSummary: { firstLines: [], lastLines: [], totalLines: 0, truncated: false },
      workingDirectory: '',
      durationMs: 0,
      error: 'No message context available',
    };
  }

  const input = correlation.messageContext.input || {};

  // Extract command from input
  const rawCommand = (input.command as string) || '';
  const command = redactSecrets(rawCommand);

  // Extract working directory if available (Claude Code may include cwd)
  // Default to process.cwd() if not specified
  const workingDirectory = (input.cwd as string) || process.cwd();

  // Extract exit code from event context
  const exitCode = extractExitCode(eventContext.output, eventContext.error, eventContext.success);

  // Create output summary
  const outputSummary = createOutputSummary(eventContext.output);

  // Mark as enriched
  markSpanEnriched(spanId);

  return {
    spanId,
    toolName: 'Bash',
    command,
    exitCode,
    outputSummary,
    workingDirectory,
    durationMs: eventContext.durationMs || 0,
  };
}

// =============================================================================
// Task/Subagent Enrichment (Story 36-4 / MSSCI-11733)
// =============================================================================

/** Max length for prompt summary */
const PROMPT_SUMMARY_LENGTH = 200;
/** Max length for result summary */
const RESULT_SUMMARY_LENGTH = 500;

/**
 * Enrich a Task span with subagent execution context
 * @param spanId - The span ID to enrich
 * @param eventContext - Additional context from OTEL event
 * @returns Enrichment result with subagent context
 */
export function enrichTaskSpan(
  spanId: string,
  eventContext: TaskEventContext
): TaskEnrichment {
  const correlation = getCorrelation(spanId);

  // Handle non-existent span
  if (!correlation) {
    return {
      spanId,
      toolName: 'Task',
      subagentType: 'unknown',
      promptSummary: '',
      resultSummary: '',
      background: false,
      durationMs: 0,
      error: 'Span not found',
    };
  }

  // Skip if already enriched
  if (correlation.enriched) {
    return {
      spanId,
      toolName: 'Task',
      subagentType: 'unknown',
      promptSummary: '',
      resultSummary: '',
      background: false,
      durationMs: 0,
      skipped: true,
    };
  }

  // Check for message context
  if (!correlation.messageContext) {
    return {
      spanId,
      toolName: 'Task',
      subagentType: 'unknown',
      promptSummary: '',
      resultSummary: '',
      background: false,
      durationMs: 0,
      error: 'No message context available',
    };
  }

  const input = correlation.messageContext.input || {};

  // Extract subagent_type from input (AC1)
  const subagentType = (input.subagent_type as string) || 'unknown';

  // Extract and summarize prompt (AC2)
  const prompt = (input.prompt as string) || '';
  const promptSummary = summarizeText(prompt, PROMPT_SUMMARY_LENGTH);

  // Summarize result from event context (AC3)
  const resultSummary = summarizeText(eventContext.result || '', RESULT_SUMMARY_LENGTH);

  // Extract background flag (AC4)
  const background = Boolean(input.run_in_background);

  // Mark as enriched
  markSpanEnriched(spanId);

  return {
    spanId,
    toolName: 'Task',
    subagentType,
    promptSummary,
    resultSummary,
    background,
    durationMs: eventContext.durationMs || 0,
  };
}
