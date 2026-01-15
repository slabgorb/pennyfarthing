/**
 * OTLP Receiver - Parses OpenTelemetry metrics and logs from Claude Code
 *
 * Receives OTLP HTTP/JSON format metrics and extracts token usage data.
 * Story 19-1: Extended to parse tool and prompt events from OTLP logs.
 * Story 19-4: Extended with per-agent token aggregation.
 * Story 19-5: Extended with per-story token aggregation.
 */
import { type DiffSummary } from './file-enrichment.js';
/** Enable/disable OTEL debug logging at runtime */
export declare function setOtelDebug(enabled: boolean): void;
/** Check if OTEL debug is enabled */
export declare function isOtelDebugEnabled(): boolean;
/**
 * Parsed tool execution event from OTLP logs
 */
export interface ToolEvent {
    /** Tool name (e.g., 'Read', 'Write', 'Bash', 'Grep') */
    toolName: string;
    /** Tool input (file path, command, pattern, etc.) */
    input?: string;
    /** Tool output (file contents, command output, etc.) */
    output?: string;
    /** Tool execution duration in milliseconds */
    durationMs?: number;
    /** Whether the tool execution succeeded */
    success: boolean;
    /** Error message if tool failed */
    error?: string;
    /** Event timestamp in milliseconds */
    timestamp: number;
    /** Trace ID for correlation */
    traceId?: string;
    /** Span ID for correlation */
    spanId?: string;
    /** File size in bytes (Read/Edit tools) */
    fileSize?: number;
    /** Line count (Read tool) */
    lineCount?: number;
    /** Detected programming language */
    language?: string;
    /** Git status of the file */
    gitStatus?: 'clean' | 'modified' | 'new' | 'untracked' | null;
    /** Diff summary for Edit operations */
    diff?: DiffSummary;
    /** Resolved file path for Read/Edit tools */
    filePath?: string;
}
/**
 * Parsed user prompt event from OTLP logs
 */
export interface ParsedPromptEvent {
    /** The prompt text */
    promptText: string;
    /** Token count for the prompt */
    tokens?: number;
    /** Event timestamp in milliseconds */
    timestamp: number;
    /** Trace ID for correlation */
    traceId?: string;
    /** Span ID for correlation */
    spanId?: string;
}
/**
 * Raw parsed log event before categorization
 */
interface RawLogEvent {
    name: string;
    timestamp: number;
    traceId?: string;
    spanId?: string;
    attributes: Record<string, string | number | boolean | undefined>;
}
/**
 * Background task data tracked from Task tool spans
 */
export interface BackgroundTask {
    taskId: string;
    description: string;
    subagentType: string;
    startedAt: number;
    status: 'pending' | 'completed';
    success?: boolean;
    output?: string;
    error?: string;
}
/**
 * Register callback for background task completion
 */
export declare function setBackgroundTaskCallback(callback: (task: BackgroundTask) => void): void;
/**
 * Track a new background task
 */
export declare function trackBackgroundTask(task: Omit<BackgroundTask, 'status'>): void;
/**
 * Get all tracked background tasks
 */
export declare function getBackgroundTasks(): BackgroundTask[];
/**
 * Reset background task store
 */
export declare function resetBackgroundTasks(): void;
export interface TokenStats {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalCostUsd: number;
    lastUpdated: number;
}
export type PartialTokenStats = Partial<Omit<TokenStats, 'lastUpdated' | 'totalCostUsd'>>;
/**
 * Register callback for token stats updates
 * Called by main.ts to wire up IPC broadcast
 */
export declare function setTokenStatsCallback(callback: (stats: TokenStats) => void): void;
/**
 * Register callback for tool event recording
 * Called by main.ts to wire up IPC broadcast to renderer
 */
export declare function setToolEventCallback(callback: (event: ToolEvent) => void): void;
/**
 * Register callback for user email updates
 * Called by main.ts to wire up IPC broadcast
 */
export declare function setUserEmailCallback(callback: (email: string) => void): void;
/**
 * Get the current user email (extracted from OTEL spans)
 */
export declare function getUserEmail(): string | null;
/**
 * Parse OTLP JSON payload and extract token usage metrics
 */
export declare function parseOTLPMetrics(body: unknown): PartialTokenStats;
/**
 * Aggregate parsed token stats into session totals
 */
export declare function aggregateTokenStats(parsed: PartialTokenStats): void;
/**
 * Get current session token stats
 */
export declare function getTokenStats(): TokenStats;
/**
 * Reset session token stats (for new session)
 */
export declare function resetTokenStats(): void;
/**
 * Parse OTLP logs payload and extract raw events
 */
export declare function parseOTLPLogs(body: unknown): RawLogEvent[];
/**
 * Record a tool event to session storage and notify listeners
 */
export declare function recordToolEvent(event: ToolEvent): void;
/**
 * Record a prompt event to session storage
 */
export declare function recordPromptEvent(event: ParsedPromptEvent): void;
/**
 * Get all stored tool events
 */
export declare function getToolEvents(): ToolEvent[];
/**
 * Get all stored prompt events
 */
export declare function getPromptEvents(): ParsedPromptEvent[];
/**
 * Reset event stores (for new session or testing)
 */
export declare function resetEventStore(): void;
/**
 * Get tool events filtered by tool type
 * @param toolType - Optional tool name to filter by (e.g., 'Bash', 'Read', 'Write')
 * @returns Filtered array of tool events
 */
export declare function getToolEventsFiltered(toolType?: string): ToolEvent[];
/**
 * Get unique tool types from all recorded events
 * @returns Array of unique tool names
 */
export declare function getToolTypes(): string[];
/**
 * Export audit log as JSON string
 * @param toolType - Optional filter by tool type
 * @returns JSON string of tool events
 */
export declare function exportAuditLogAsJSON(toolType?: string): string;
/**
 * Export audit log as CSV string
 * @param toolType - Optional filter by tool type
 * @returns CSV string of tool events
 */
export declare function exportAuditLogAsCSV(toolType?: string): string;
/**
 * Get audit log statistics
 * @returns Summary statistics of tool events
 */
export declare function getAuditLogStats(): {
    total: number;
    byType: Record<string, number>;
    successCount: number;
    errorCount: number;
};
/**
 * Process raw log events and store them appropriately
 * Called by the /v1/logs endpoint
 *
 * Actual Claude Code OTEL format (discovered via debug):
 * - tool_name (not tool.name)
 * - success as string "true"/"false" (not boolean)
 * - duration_ms (not tool.duration_ms)
 * - tool_parameters as JSON string (not tool.input)
 */
export declare function processLogEvents(rawEvents: RawLogEvent[]): Promise<void>;
export {};
//# sourceMappingURL=otlp-receiver.d.ts.map