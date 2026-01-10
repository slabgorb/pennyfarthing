/**
 * OTLP Receiver - Parses OpenTelemetry metrics and logs from Claude Code
 *
 * Receives OTLP HTTP/JSON format metrics and extracts token usage data.
 * Story 19-1: Extended to parse tool and prompt events from OTLP logs.
 * Story 19-4: Extended with per-agent token aggregation.
 * Story 19-5: Extended with per-story token aggregation.
 */
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
 * Record a tool event to session storage
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
 * Process raw log events and store them appropriately
 * Called by the /v1/logs endpoint
 */
export declare function processLogEvents(rawEvents: RawLogEvent[]): void;
export {};
//# sourceMappingURL=otlp-receiver.d.ts.map