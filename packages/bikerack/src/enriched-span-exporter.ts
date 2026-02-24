/**
 * Enriched Span Exporter - Story MSSCI-11734
 *
 * Provides functions to retrieve, filter, format, and export enriched span data.
 * Bridges the internal ToolEvent storage to the EnrichedSpan format for API and UI.
 *
 * Features:
 * - Retrieve all enriched spans with their tool-specific attributes
 * - Filter spans by tool type, status, and time range
 * - Format spans for JSON export with ISO timestamps
 * - Export with metadata and summary statistics
 */

import { getToolEvents, resetEventStore, type ToolEvent } from './otlp-receiver.js';
import type { DiffSummary, OutputSummary } from './file-enrichment.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Enriched span with tool-specific attributes
 * Unifies the various enrichment types into a single exportable format
 */
export interface EnrichedSpan {
  /** Unique span identifier */
  spanId: string;
  /** Trace identifier for correlation */
  traceId: string;
  /** Tool name (e.g., 'Bash', 'Read', 'Edit', 'Task', 'Grep') */
  toolName: string;
  /** Start time as Unix timestamp (milliseconds) */
  startTime: number;
  /** End time as Unix timestamp (milliseconds) */
  endTime?: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Span status */
  status: 'running' | 'completed' | 'error';
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Tool-specific enrichment attributes */
  enrichment: EnrichmentData;
}

/**
 * Formatted span for export with ISO timestamps
 */
export interface FormattedSpan extends EnrichedSpan {
  /** Start time in ISO format */
  startTimeISO: string;
  /** End time in ISO format */
  endTimeISO?: string;
}

/**
 * Tool-specific enrichment data (union of all tool types)
 */
export type EnrichmentData =
  | BashEnrichmentData
  | ReadEnrichmentData
  | EditEnrichmentData
  | WriteEnrichmentData
  | TaskEnrichmentData
  | SearchEnrichmentData
  | Record<string, unknown>; // Fallback for unknown tools

/**
 * Bash tool enrichment
 */
export interface BashEnrichmentData {
  command?: string;
  exitCode?: number | null;
  outputSummary?: OutputSummary;
  workingDirectory?: string;
}

/**
 * Read tool enrichment
 */
export interface ReadEnrichmentData {
  filePath?: string;
  fileSize?: number;
  lineCount?: number;
  language?: string;
  gitStatus?: 'clean' | 'modified' | 'new' | 'untracked' | null;
}

/**
 * Edit tool enrichment
 */
export interface EditEnrichmentData {
  fileSize?: number;
  language?: string;
  gitStatus?: 'clean' | 'modified' | 'new' | 'untracked' | null;
  diff?: DiffSummary;
}

/**
 * Write tool enrichment
 */
export interface WriteEnrichmentData {
  fileSize?: number;
  lineCount?: number;
  language?: string;
  gitStatus?: 'clean' | 'modified' | 'new' | 'untracked' | null;
}

/**
 * Task/subagent enrichment
 */
export interface TaskEnrichmentData {
  subagentType?: string;
  promptSummary?: string;
  resultSummary?: string;
  background?: boolean;
}

/**
 * Search (Grep/Glob) enrichment
 */
export interface SearchEnrichmentData {
  pattern?: string;
  matchCount?: number;
  fileCount?: number;
  truncated?: boolean;
}

/**
 * Filter options for span queries
 */
export interface SpanFilter {
  /** Filter by tool types (e.g., ['Bash', 'Read']) */
  toolTypes?: string[];
  /** Filter by status ('success' or 'error') */
  status?: 'success' | 'error';
  /** Filter spans starting after this time (Unix timestamp ms) */
  startTime?: number;
  /** Filter spans starting before this time (Unix timestamp ms) */
  endTime?: number;
}

/**
 * Summary statistics for export
 */
export interface ExportSummary {
  /** Total duration of all spans in milliseconds */
  totalDurationMs: number;
  /** Count of successful spans */
  successCount: number;
  /** Count of error spans */
  errorCount: number;
  /** Breakdown by tool type */
  toolBreakdown: Record<string, number>;
}

/**
 * Complete export result with metadata
 */
export interface EnrichedSpanExport {
  /** ISO timestamp of when export was generated */
  exportedAt: string;
  /** Number of spans in export */
  spanCount: number;
  /** Export metadata */
  metadata: {
    version: string;
    exportFormat: string;
  };
  /** Summary statistics */
  summary: ExportSummary;
  /** The exported spans */
  spans: FormattedSpan[];
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Convert a ToolEvent to an EnrichedSpan
 */
function toolEventToEnrichedSpan(event: ToolEvent): EnrichedSpan {
  const enrichment = buildEnrichmentData(event);
  const spanId = (event.spanId as string) || `span-${event.timestamp as number}`;
  const traceId = (event.traceId as string) || 'unknown';
  const timestamp = (event.timestamp as number) || 0;
  const durationMs = (event.durationMs as number) || 0;
  const success = (event.success ?? false) as boolean;
  const error = event.error as string | undefined;

  return {
    spanId,
    traceId,
    toolName: event.toolName,
    startTime: timestamp,
    endTime: durationMs ? timestamp + durationMs : undefined,
    durationMs,
    status: error ? 'error' : 'completed',
    success,
    error,
    enrichment,
  };
}

/**
 * Build tool-specific enrichment data from a ToolEvent
 */
function buildEnrichmentData(event: ToolEvent): EnrichmentData {
  switch (event.toolName) {
    case 'Bash':
      return {
        command: event.input,
        exitCode: (event as unknown as { exitCode?: number }).exitCode ?? null,
        outputSummary: (event as unknown as { outputSummary?: OutputSummary }).outputSummary,
        workingDirectory: (event as unknown as { workingDirectory?: string }).workingDirectory,
      };

    case 'Read':
      return {
        filePath: event.filePath,
        fileSize: event.fileSize,
        lineCount: event.lineCount,
        language: event.language,
        gitStatus: event.gitStatus,
      };

    case 'Edit':
      return {
        fileSize: event.fileSize,
        language: event.language,
        gitStatus: event.gitStatus,
        diff: event.diff,
      };

    case 'Write':
      return {
        fileSize: event.fileSize,
        lineCount: event.lineCount,
        language: event.language,
        gitStatus: event.gitStatus,
      };

    case 'Task':
      return {
        subagentType: (event as unknown as { subagentType?: string }).subagentType,
        promptSummary: (event as unknown as { promptSummary?: string }).promptSummary,
        resultSummary: (event as unknown as { resultSummary?: string }).resultSummary,
        background: (event as unknown as { background?: boolean }).background,
      };

    case 'Grep':
    case 'Glob':
      return {
        pattern: event.input,
        matchCount: (event as unknown as { matchCount?: number }).matchCount,
        fileCount: (event as unknown as { fileCount?: number }).fileCount,
        truncated: (event as unknown as { truncated?: boolean }).truncated,
      };

    default:
      return {
        input: event.input,
        output: event.output,
      };
  }
}

/**
 * Retrieve all enriched spans from the OTEL receiver storage
 * @returns Promise resolving to array of enriched spans
 */
export async function getEnrichedSpans(): Promise<EnrichedSpan[]> {
  const toolEvents = getToolEvents();
  return toolEvents.map(toolEventToEnrichedSpan);
}

/**
 * Clear all enriched spans by resetting the underlying event store
 */
export function clearEnrichedSpans(): void {
  resetEventStore();
}

/**
 * Filter spans by the given criteria
 * @param spans - Array of spans to filter
 * @param filter - Filter options
 * @returns Filtered array of spans
 */
export function filterSpans(spans: EnrichedSpan[], filter: SpanFilter): EnrichedSpan[] {
  let result = [...spans];

  // Filter by tool types
  if (filter.toolTypes && filter.toolTypes.length > 0) {
    result = result.filter((s) => filter.toolTypes!.includes(s.toolName));
  }

  // Filter by status
  if (filter.status) {
    if (filter.status === 'success') {
      result = result.filter((s) => s.success === true);
    } else if (filter.status === 'error') {
      result = result.filter((s) => s.status === 'error');
    }
  }

  // Filter by time range
  if (filter.startTime !== undefined) {
    result = result.filter((s) => s.startTime >= filter.startTime!);
  }
  if (filter.endTime !== undefined) {
    result = result.filter((s) => s.startTime <= filter.endTime!);
  }

  return result;
}

/**
 * Format a span for export with ISO timestamps
 * @param span - The span to format
 * @returns Formatted span with ISO timestamps
 */
export function formatSpanForExport(span: EnrichedSpan): FormattedSpan {
  return {
    ...span,
    startTimeISO: new Date(span.startTime).toISOString(),
    endTimeISO: span.endTime ? new Date(span.endTime).toISOString() : undefined,
  };
}

/**
 * Calculate summary statistics for a set of spans
 */
function calculateSummary(spans: EnrichedSpan[]): ExportSummary {
  const toolBreakdown: Record<string, number> = {};
  let totalDurationMs = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const span of spans) {
    // Tool breakdown
    toolBreakdown[span.toolName] = (toolBreakdown[span.toolName] || 0) + 1;

    // Duration
    totalDurationMs += span.durationMs;

    // Success/error counts
    if (span.success) {
      successCount++;
    } else {
      errorCount++;
    }
  }

  return {
    totalDurationMs,
    successCount,
    errorCount,
    toolBreakdown,
  };
}

/**
 * Export enriched spans with metadata and summary
 * @param spans - Array of spans to export
 * @param filter - Optional filter to apply before export
 * @returns Complete export object
 */
export function exportEnrichedSpans(
  spans: EnrichedSpan[],
  filter?: SpanFilter
): EnrichedSpanExport {
  // Apply filter if provided
  const filteredSpans = filter ? filterSpans(spans, filter) : spans;

  // Format all spans
  const formattedSpans = filteredSpans.map(formatSpanForExport);

  // Calculate summary
  const summary = calculateSummary(filteredSpans);

  return {
    exportedAt: new Date().toISOString(),
    spanCount: formattedSpans.length,
    metadata: {
      version: '1.0.0',
      exportFormat: 'cyclist-enriched-spans',
    },
    summary,
    spans: formattedSpans,
  };
}
